import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import { z } from 'zod'
import { bugRepository } from '../db/repository'
import { runRepository } from '../db/runRepository'
import { generatePlan } from '../services/planner'
import { RunWithPlanSchema } from '../schemas/run'
import { ApprovalError, approvalExpiryFrom, claimApprovedRun, completeApprovedRun, decideRunApproval, hashPlan, markRunVerifying, verifyApproverAuthorization } from '../services/approvals'
import { env } from '../config/env'
import { TargetValidationError } from '../services/targetValidation'
import { executeApprovedPlan } from '../services/executor'
import { sanitizeError } from '../browser/telemetry'
import { createEvidenceDownloadUrl } from '../services/evidenceStorage'
import type { RunWithPlan } from '../schemas/run'

export const runsRouter = Router()
let browserExecutionBusy = false

const CreateRunSchema = z.object({ bugReportId: z.string().trim().min(1) }).strict()
const ApprovalRequestSchema = z.object({ decision: z.enum(['approved', 'rejected']) }).strict()

async function finishClaimedRun(run: RunWithPlan): Promise<void> {
  try {
    const evidence = await executeApprovedPlan(run)
    await markRunVerifying(run.id, evidence)
    await completeApprovedRun(run.id, evidence.result)
  } catch (cause) {
    console.error(`Background browser execution failed for run ${run.id}: ${sanitizeError(cause)}`)
    try {
      let current = await runRepository.get(run.id)
      if (current?.status === 'running') {
        const timestamp = new Date().toISOString()
        await markRunVerifying(run.id, {
          startedAt: run.updatedAt,
          completedAt: timestamp,
          result: 'inconclusive',
          artifactDirectory: path.join(env.RUN_ARTIFACTS_DIR, run.id.replace(/[^a-z0-9-]/gi, '_')),
          files: [],
          evidenceRecords: [],
          telemetry: [],
          error: sanitizeError(cause),
        })
        current = await runRepository.get(run.id)
      }
      if (current?.status === 'verifying') {
        await completeApprovedRun(run.id, current.execution?.result ?? 'inconclusive')
      }
    } catch (recoveryCause) {
      console.error(`Could not finalize failed browser execution for run ${run.id}: ${sanitizeError(recoveryCause)}`)
    }
  }
}

runsRouter.get('/', async (_request, response) => {
  response.json(await runRepository.list())
})

runsRouter.post('/:id/approve', async (request, response) => {
  if (!env.APPROVAL_USERNAME || !env.APPROVAL_PASSWORD) {
    response.status(503).json({ error: 'approval_auth_not_configured', message: 'Configure server-side approval credentials before recording decisions.' })
    return
  }
  const approver = verifyApproverAuthorization(request.header('authorization'))
  if (!approver) {
    response.setHeader('WWW-Authenticate', 'Basic realm="ReproProof approval", charset="UTF-8"')
    response.status(401).json({ error: 'approver_authentication_required' })
    return
  }
  const parsed = ApprovalRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: 'invalid_approval_request' })
    return
  }
  const run = await runRepository.get(request.params.id)
  if (!run) {
    response.status(404).json({ error: 'run_not_found' })
    return
  }
  try {
    response.json(await decideRunApproval(run, parsed.data.decision, approver))
  } catch (cause) {
    if (cause instanceof ApprovalError) {
      const status = cause.code === 'invalid_run_state' ? 409 : cause.code === 'approval_expired' ? 410 : cause.code === 'target_invalid' ? 403 : 409
      response.status(status).json({ error: cause.code })
      return
    }
    console.error(`Could not record approval for run ${run.id}:`, cause)
    response.status(500).json({ error: 'approval_record_failed' })
  }
})

runsRouter.get('/:id', async (request, response) => {
  const run = await runRepository.get(request.params.id)
  if (!run) {
    response.status(404).json({ error: 'run_not_found' })
    return
  }
  response.json(run)
})

runsRouter.get('/:id/evidence/:evidenceId', async (request, response) => {
  const run = await runRepository.get(request.params.id)
  if (!run?.execution) {
    response.status(404).json({ error: 'evidence_not_found' })
    return
  }
  const record = run.execution.evidenceRecords.find(item => item.id === request.params.evidenceId)
  if (!record || record.runId !== run.id) {
    response.status(404).json({ error: 'evidence_not_found' })
    return
  }
  const safeRunId = run.id.replace(/[^a-z0-9-]/gi, '_')
  if (!record.storageKey.startsWith(`${safeRunId}/`)) {
    response.status(404).json({ error: 'evidence_not_found' })
    return
  }
  const signedUrl = await createEvidenceDownloadUrl(record.storageKey)
  if (signedUrl) {
    response.setHeader('Cache-Control', 'private, no-store')
    response.redirect(302, signedUrl)
    return
  }
  if (!/^[a-zA-Z0-9_-]+\/(?:screenshots\/[a-zA-Z0-9._-]+\.png|video\/[a-zA-Z0-9._-]+\.webm|console\.json|network\.json|report\.json)$/.test(record.storageKey)) {
    response.status(404).json({ error: 'evidence_not_found' })
    return
  }
  const runDirectory = path.resolve(env.RUN_ARTIFACTS_DIR, safeRunId)
  const relativeStorageKey = record.storageKey.slice(record.storageKey.indexOf('/') + 1)
  const candidate = path.resolve(runDirectory, relativeStorageKey)
  if (!candidate.startsWith(`${runDirectory}${path.sep}`)) {
    response.status(404).json({ error: 'evidence_not_found' })
    return
  }
  try {
    const actual = await realpath(candidate)
    const actualRunDirectory = await realpath(runDirectory)
    if (!actual.startsWith(`${actualRunDirectory}${path.sep}`) || !(await stat(actual)).isFile()) {
      response.status(404).json({ error: 'evidence_not_found' })
      return
    }
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.sendFile(actual, { dotfiles: 'deny' }, error => {
      if (error && !response.headersSent) response.status(404).json({ error: 'evidence_not_found' })
    })
  } catch {
    response.status(404).json({ error: 'evidence_not_found' })
  }
})

runsRouter.post('/:id/execute', async (request, response) => {
  const runId = request.params.id
  if (browserExecutionBusy) {
    response.status(409).json({ error: 'browser_executor_busy' })
    return
  }
  browserExecutionBusy = true
  let claimed: RunWithPlan
  try {
    const existing = await runRepository.get(runId)
    if (!existing) {
      browserExecutionBusy = false
      response.status(404).json({ error: 'run_not_found' })
      return
    }
    claimed = await claimApprovedRun(existing.id)
  } catch (cause) {
    browserExecutionBusy = false
    if (cause instanceof ApprovalError) {
      const status = cause.code === 'approval_required' || cause.code === 'invalid_run_state' ? 409
        : cause.code === 'target_invalid' ? 403 : 409
      response.status(status).json({ error: cause.code })
      return
    }
    if (cause instanceof TargetValidationError) response.status(403).json({ error: cause.code })
    else {
      console.error(`Could not start browser execution for run ${runId}: ${sanitizeError(cause)}`)
      response.status(500).json({ error: 'browser_execution_start_failed' })
    }
    return
  }
  response.setHeader('Location', `/api/runs/${encodeURIComponent(claimed.id)}`)
  response.setHeader('Retry-After', '2')
  response.status(202).json(claimed)
  setImmediate(() => {
    void finishClaimedRun(claimed).finally(() => { browserExecutionBusy = false })
  })
})

runsRouter.post('/', async (request, response) => {
  const parsed = CreateRunSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({
      error: 'invalid_run_request',
      issues: parsed.error.issues.map(issue => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    })
    return
  }

  const bug = await bugRepository.get(parsed.data.bugReportId)
  if (!bug) {
    response.status(404).json({ error: 'bug_not_found' })
    return
  }

  let plan
  try {
    plan = await generatePlan(bug)
  } catch (cause) {
    if (cause instanceof TargetValidationError) {
      response.status(403).json({ error: cause.code, message: 'Target must use an explicitly approved HTTPS origin that resolves only to public addresses.' })
      return
    }
    const rawReason = cause instanceof Error ? cause.message : String(cause)
    const reason = rawReason
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted API key]')
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, 500)
    console.error(`Plan generation failed for bug ${bug.id}: ${reason}`)
    response.status(502).json({
      error: 'plan_generation_failed',
      message: 'Could not generate a valid plan from this report. No run was created.',
      ...(process.env.NODE_ENV === 'development' ? { reason } : {}),
    })
    return
  }

  const now = new Date().toISOString()
  const run = RunWithPlanSchema.parse({
    id: randomUUID(),
    bugReportId: bug.id,
    status: 'awaiting_approval',
    browser: bug.environment.browser,
    createdAt: now,
    updatedAt: now,
    planHash: hashPlan(plan),
    approvalExpiresAt: approvalExpiryFrom(new Date(now)),
    approval: null,
    plan,
  })

  try {
    const savedRun = await runRepository.save(run)
    response.status(201).json(savedRun)
  } catch {
    response.status(500).json({ error: 'run_storage_failed', message: 'The plan was generated, but the run could not be saved.' })
  }
})
