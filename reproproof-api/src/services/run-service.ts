import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { env } from '../config/env'
import { supabase } from '../db/client'
import { runRepository } from '../db/runRepository'
import type { RunWithPlan } from '../schemas/run'
import { sanitizeError } from '../browser/telemetry'
import { verifyApprovedPlan } from './verifier'
import { completeApprovedRun, markRunVerifying } from './approvals'

const workerId = randomUUID()
const pollIntervalMs = 1_500
const heartbeatIntervalMs = 15_000
const staleJobAfterMs = 120_000
let workerStarted = false
let stopping = false

type QueueJob = { job_id: string; run_id: string; plan_hash: string }

export async function enqueueApprovedRun(run: RunWithPlan): Promise<void> {
  if (!supabase) throw new Error('The durable browser queue requires Supabase database configuration')
  const { error } = await supabase.rpc('enqueue_approved_run', { p_run_id: run.id, p_plan_hash: run.planHash })
  if (error) throw error
}

async function processClaimedRun(run: RunWithPlan): Promise<boolean> {
  try {
    const evidence = await verifyApprovedPlan(run, undefined, async progress => {
      const saved = await runRepository.updateProgress(run.id, run.planHash, progress)
      if (!saved) throw new Error('Run state changed while browser execution was in progress')
    })
    await markRunVerifying(run.id, evidence)
    const infrastructureFailed = evidence.attempts.length < 2 || evidence.attempts.some(attempt => !attempt.completed)
    await completeApprovedRun(run.id, infrastructureFailed ? 'failed' : evidence.result)
    return !infrastructureFailed
  } catch (cause) {
    console.error(`Background browser execution failed for run ${run.id}: ${sanitizeError(cause)}`)
    try {
      const current = await runRepository.get(run.id)
      if (current?.status === 'running') {
        const now = new Date().toISOString()
        await markRunVerifying(run.id, {
          startedAt: run.updatedAt,
          completedAt: now,
          result: 'inconclusive',
          artifactDirectory: path.join(env.RUN_ARTIFACTS_DIR, run.id.replace(/[^a-z0-9-]/gi, '_')),
          files: [], evidenceRecords: [], telemetry: [], attempts: [], error: sanitizeError(cause),
        })
      }
      const verifying = await runRepository.get(run.id)
      if (verifying?.status === 'verifying') await completeApprovedRun(run.id, 'failed')
    } catch (recoveryCause) {
      console.error(`Could not finalize failed browser execution for run ${run.id}: ${sanitizeError(recoveryCause)}`)
    }
    return false
  }
}

async function claimJob(): Promise<QueueJob | undefined> {
  if (!supabase) throw new Error('The durable browser queue requires Supabase database configuration')
  const { data, error } = await supabase.rpc('claim_next_run_job', { p_worker_id: workerId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row?.job_id && row?.run_id && row?.plan_hash ? row as QueueJob : undefined
}

async function heartbeat(job: QueueJob): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('heartbeat_run_job', { p_job_id: job.job_id, p_worker_id: workerId })
  if (error) throw error
  return data === true
}

async function finishJob(job: QueueJob, succeeded: boolean, errorMessage: string | null): Promise<void> {
  if (!supabase) throw new Error('The durable browser queue requires Supabase database configuration')
  const { data, error } = await supabase.rpc('finish_run_job', {
    p_job_id: job.job_id,
    p_worker_id: workerId,
    p_succeeded: succeeded,
    p_error: errorMessage,
  })
  if (error) throw error
  if (data !== true) throw new Error(`Worker ${workerId} no longer owns queue job ${job.job_id}`)
}

async function processJob(job: QueueJob): Promise<void> {
  let heartbeatBusy = false
  let leaseLost = false
  const timer = setInterval(() => {
    if (heartbeatBusy || leaseLost) return
    heartbeatBusy = true
    void heartbeat(job).then(owned => {
      if (!owned) leaseLost = true
    }).catch(cause => {
      console.error(`Queue heartbeat failed for job ${job.job_id}: ${sanitizeError(cause)}`)
    }).finally(() => { heartbeatBusy = false })
  }, heartbeatIntervalMs)

  let succeeded = false
  let failure: string | null = null
  try {
    const run = await runRepository.get(job.run_id)
    if (!run || run.status !== 'running' || run.planHash !== job.plan_hash) {
      throw new Error('Claimed queue job no longer matches its running plan')
    }
    succeeded = await processClaimedRun(run)
    if (!succeeded) failure = 'Browser execution failed or could not complete both verification attempts'
  } catch (cause) {
    failure = sanitizeError(cause)
    console.error(`Could not process queue job ${job.job_id}: ${failure}`)
  } finally {
    clearInterval(timer)
    try {
      await finishJob(job, succeeded && !leaseLost, leaseLost ? 'Worker lost its queue lease' : failure)
    } catch (cause) {
      console.error(`Could not finish queue job ${job.job_id}: ${sanitizeError(cause)}`)
    }
  }
}

async function workerLoop(): Promise<void> {
  while (!stopping) {
    try {
      const job = await claimJob()
      if (job) {
        await processJob(job)
        continue
      }
    } catch (cause) {
      console.error(`Durable queue poll failed: ${sanitizeError(cause)}`)
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }
}

/** Start one polling worker per process. Replicas coordinate through atomic
 * Postgres claims, and each process runs only one browser job at a time. */
export function startRunWorker(): void {
  if (workerStarted) return
  if (!supabase) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the durable browser queue')
  workerStarted = true
  void workerLoop()
}

/** Reconcile stale queue leases without touching jobs owned by live replicas. */
export async function recoverInterruptedRuns(): Promise<void> {
  if (!supabase) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for durable run persistence and queueing')
  const staleBefore = new Date(Date.now() - staleJobAfterMs).toISOString()
  const { error } = await supabase.rpc('recover_stale_run_jobs', { p_stale_before: staleBefore })
  if (error) throw error
}
