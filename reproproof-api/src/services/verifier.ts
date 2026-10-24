import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { env } from '../config/env'
import { validateTargetUrl } from './targetValidation'
import { redactValue } from './redactor'
import { executeApprovedPlan } from './executor'
import { persistEvidenceFiles } from './evidenceStorage'
import { ExecutionEvidenceSchema, VerificationAttemptSchema, type RunWithPlan } from '../schemas/run'
import type { AgentPlan } from '../schemas/plan'

type Attempt = z.infer<typeof VerificationAttemptSchema>
type Verification = z.infer<typeof ExecutionEvidenceSchema>
type ExecuteAttempt = (run: RunWithPlan, attemptNumber: number, onActionCompleted?: (completed: number) => Promise<void>) => Promise<Attempt>
type Progress = NonNullable<RunWithPlan['progress']>
type ProgressCallback = (progress: Progress) => Promise<void>

const resetTimeoutMs = 10_000
const readOnlyVerificationNote = 'Verification mode: read_only. Run two attempts without reset; approved plan contains no click, fill, or select actions.'
const resetRequiredNote = 'Verification mode: reset_required. Configure VERIFICATION_RESET_URL and create a newly approved plan before execution.'

function resetPrecondition(url: string): string {
  const parsed = new URL(url)
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('VERIFICATION_RESET_URL must not include credentials, query parameters, or a fragment; use VERIFICATION_RESET_TOKEN for authentication')
  }
  return `Reset before attempt 2: POST ${url}; endpoint must reset authorized disposable test state and return {"reset":true}.`
}

export function addResetPrecondition(plan: AgentPlan): AgentPlan {
  const verificationMode = env.VERIFICATION_RESET_URL ? 'reset' : planRequiresReset(plan) ? 'reset_required' : 'read_only'
  const note = verificationMode === 'reset'
    ? resetPrecondition(env.VERIFICATION_RESET_URL!)
    : verificationMode === 'reset_required' ? resetRequiredNote : readOnlyVerificationNote
  return { ...plan, verificationMode, preconditions: [...plan.preconditions, note] }
}

export function planRequiresReset(plan: AgentPlan): boolean {
  return plan.steps.some(step => step.action?.type === 'click' || step.action?.type === 'fill' || step.action?.type === 'select')
}

async function assertResetConfigured(run: RunWithPlan): Promise<URL | undefined> {
  if (run.plan.verificationMode === 'read_only'
    && !planRequiresReset(run.plan)
    && run.plan.preconditions.includes(readOnlyVerificationNote)) return undefined
  if (run.plan.verificationMode !== 'reset') {
    throw new Error('No approved reset procedure is configured for this state-modifying plan')
  }
  const configured = env.VERIFICATION_RESET_URL
  if (!configured) {
    if (!planRequiresReset(run.plan) && run.plan.preconditions.includes(readOnlyVerificationNote)) return undefined
    throw new Error('No approved reset procedure is configured for this state-modifying plan')
  }
  if (!run.plan.preconditions.includes(resetPrecondition(configured))) {
    throw new Error('No approved reset procedure is configured for this plan')
  }
  const targetText = run.plan.preconditions.find(item => item.startsWith('Approved target: '))?.slice('Approved target: '.length)
  if (!targetText) throw new Error('Approved target is missing')
  const target = await validateTargetUrl(targetText)
  const resetUrl = await validateTargetUrl(configured)
  if (resetUrl.origin !== target.origin) throw new Error('Reset endpoint must use the approved application origin')
  return resetUrl
}

async function resetToKnownState(run: RunWithPlan): Promise<void> {
  const resetUrl = await assertResetConfigured(run)
  if (!resetUrl) throw new Error('A reset endpoint is required for this plan')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), resetTimeoutMs)
  try {
    const response = await fetch(resetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.VERIFICATION_RESET_TOKEN ? { Authorization: `Bearer ${env.VERIFICATION_RESET_TOKEN}` } : {}),
      },
      body: JSON.stringify({ runId: run.id, bugReportId: run.bugReportId }),
      redirect: 'manual',
      signal: controller.signal,
    })
    if (!response.ok || response.status >= 300) throw new Error('Reset endpoint did not return a successful response')
    let result: unknown
    try { result = await response.json() } catch { throw new Error('Reset endpoint returned invalid JSON') }
    if (!result || typeof result !== 'object' || !('reset' in result) || result.reset !== true) {
      throw new Error('Reset endpoint did not confirm the test state was reset')
    }
  } finally {
    clearTimeout(timer)
  }
}

function runResult(first: Attempt, second: Attempt): Verification['result'] {
  if (!first.completed || !second.completed) return 'inconclusive'
  if (first.expectedFailureFound && second.expectedFailureFound) {
    return first.fingerprint?.hash && first.fingerprint.hash === second.fingerprint?.hash ? 'reproduced' : 'inconclusive'
  }
  if (!first.expectedFailureFound && !second.expectedFailureFound) return 'not_reproduced'
  return 'inconclusive'
}

export function determineVerdict(first: Attempt, second: Attempt): Verification['result'] {
  return runResult(first, second)
}

export async function verifyApprovedPlan(
  run: RunWithPlan,
  execute: ExecuteAttempt = executeApprovedPlan,
  onProgress?: ProgressCallback,
): Promise<Verification> {
  const runRoot = path.resolve(env.RUN_ARTIFACTS_DIR, run.id.replace(/[^a-z0-9-]/gi, '_'))
  const startedAt = new Date().toISOString()
  const attempts: Attempt[] = []
  let error: string | null = null
  let result: Verification['result'] = 'inconclusive'

  try {
    const resetUrl = await assertResetConfigured(run)
    if (resetUrl) {
      await onProgress?.({ phase: 'resetting', currentAttempt: 1, completedAttempts: 0, completedActions: 0, totalActions: run.plan.steps.length, message: 'Resetting test state before attempt 1', updatedAt: new Date().toISOString() })
      await resetToKnownState(run)
    }
    await onProgress?.({ phase: 'running_attempt', currentAttempt: 1, completedAttempts: 0, completedActions: 0, totalActions: run.plan.steps.length, message: 'Running attempt 1 of 2', updatedAt: new Date().toISOString() })
    const first = await execute(run, 1, async completedActions => {
      await onProgress?.({ phase: 'running_attempt', currentAttempt: 1, completedAttempts: 0, completedActions, totalActions: run.plan.steps.length, message: `Attempt 1: completed ${completedActions} of ${run.plan.steps.length} actions`, updatedAt: new Date().toISOString() })
    })
    attempts.push(first)
    if (!first.completed) throw new Error('Attempt 1 did not complete; the second attempt was not started')

    if (resetUrl) {
      await onProgress?.({ phase: 'resetting', currentAttempt: null, completedAttempts: 1, completedActions: run.plan.steps.length, totalActions: run.plan.steps.length, message: 'Resetting test state before attempt 2', updatedAt: new Date().toISOString() })
      await resetToKnownState(run)
    }
    await onProgress?.({ phase: 'running_attempt', currentAttempt: 2, completedAttempts: 1, completedActions: 0, totalActions: run.plan.steps.length, message: 'Running attempt 2 of 2', updatedAt: new Date().toISOString() })
    const second = await execute(run, 2, async completedActions => {
      await onProgress?.({ phase: 'running_attempt', currentAttempt: 2, completedAttempts: 1, completedActions, totalActions: run.plan.steps.length, message: `Attempt 2: completed ${completedActions} of ${run.plan.steps.length} actions`, updatedAt: new Date().toISOString() })
    })
    attempts.push(second)
    await onProgress?.({ phase: 'comparing', currentAttempt: null, completedAttempts: 2, completedActions: run.plan.steps.length, totalActions: run.plan.steps.length, message: 'Comparing attempt results and failure fingerprints', updatedAt: new Date().toISOString() })
    result = runResult(first, second)
    if (first.expectedFailureFound && second.expectedFailureFound && result === 'inconclusive') {
      error = 'Both attempts detected expected failures, but their fingerprints differ; review the attempt evidence.'
    } else if (first.expectedFailureFound !== second.expectedFailureFound) {
      error = 'Attempts disagreed about whether the reported failure occurred; review the attempt evidence.'
    } else if (!second.completed) {
      error = 'Attempt 2 did not complete.'
    }
  } catch (cause) {
    error = redactValue(cause instanceof Error ? cause.message : String(cause)).slice(0, 2000)
    result = 'inconclusive'
  }

  const completedAt = new Date().toISOString()
  const evidenceRecords = attempts.flatMap(attempt => attempt.evidenceRecords)
  const files = attempts.flatMap(attempt => attempt.files.map(file => ({
    ...file,
    file: path.posix.join(`attempt-${attempt.attemptNumber}`, file.file),
  })))
  const telemetry = attempts.flatMap(attempt => attempt.telemetry)
  const safeRunId = run.id.replace(/[^a-z0-9-]/gi, '_')

  try {
    await mkdir(runRoot, { recursive: true, mode: 0o700 })
    const reportRecord = {
      id: randomUUID(),
      runId: run.id,
      attemptNumber: attempts.at(-1)?.attemptNumber ?? 1,
      type: 'report' as const,
      storageKey: `${safeRunId}/verification-report.json`,
      createdAt: completedAt,
      sanitized: true,
    }
    evidenceRecords.push(reportRecord)
    const report = redactValue({
      runId: run.id,
      verdict: result,
      startedAt,
      completedAt,
      error,
      attempts: attempts.map(attempt => ({
        attemptNumber: attempt.attemptNumber,
        completed: attempt.completed,
        expectedFailureFound: attempt.expectedFailureFound,
        result: attempt.result,
        fingerprint: attempt.fingerprint,
        evidenceRecords: attempt.evidenceRecords,
        error: attempt.error,
      })),
      evidenceRecords,
    })
    await writeFile(path.join(runRoot, 'verification-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
    await persistEvidenceFiles(runRoot, [reportRecord])
  } catch (cause) {
    evidenceRecords.pop()
    result = 'inconclusive'
    error = redactValue(error ?? `Could not persist verification report: ${cause instanceof Error ? cause.message : String(cause)}`).slice(0, 2000)
  }

  return ExecutionEvidenceSchema.parse({
    startedAt,
    completedAt,
    result,
    artifactDirectory: path.relative(process.cwd(), runRoot) || runRoot,
    files,
    evidenceRecords,
    telemetry,
    attempts,
    error,
  })
}
