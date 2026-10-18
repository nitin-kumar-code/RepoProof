import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { bugRepository } from '../db/repository'
import { runRepository } from '../db/runRepository'
import { generatePlan } from '../services/planner'
import { RunWithPlanSchema } from '../schemas/run'
import { ApprovalError, approvalExpiryFrom, decideRunApproval, hashPlan, verifyApproverAuthorization } from '../services/approvals'
import { env } from '../config/env'

export const runsRouter = Router()

const CreateRunSchema = z.object({ bugReportId: z.string().trim().min(1) }).strict()
const ApprovalRequestSchema = z.object({ decision: z.enum(['approved', 'rejected']) }).strict()

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
      const status = cause.code === 'invalid_run_state' ? 409 : cause.code === 'approval_expired' ? 410 : 409
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
