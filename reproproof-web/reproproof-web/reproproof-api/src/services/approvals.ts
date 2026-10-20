import { createHash, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env'
import { runRepository, type ApprovalDecision } from '../db/runRepository'
import type { AgentPlan } from '../schemas/plan'
import type { RunWithPlan } from '../schemas/run'
import type { ExecutionEvidenceSchema } from '../schemas/run'
import { z } from 'zod'
import { validateTargetUrl } from './targetValidation'

const approvalLifetimeMs = 24 * 60 * 60 * 1000

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function hashPlan(plan: AgentPlan): string {
  return createHash('sha256').update(stableJson(plan)).digest('hex')
}

export function approvalExpiryFrom(now = new Date()): string {
  return new Date(now.getTime() + approvalLifetimeMs).toISOString()
}

export function verifyApproverAuthorization(header: string | undefined): string | undefined {
  if (!env.APPROVAL_USERNAME || !env.APPROVAL_PASSWORD || !header?.startsWith('Basic ')) return undefined
  let decoded: string
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  } catch {
    return undefined
  }
  const separator = decoded.indexOf(':')
  if (separator < 0) return undefined
  const username = decoded.slice(0, separator)
  const password = decoded.slice(separator + 1)
  const safeEqual = (actual: string, expected: string): boolean => {
    const actualBytes = Buffer.from(actual)
    const expectedBytes = Buffer.from(expected)
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
  }
  return safeEqual(username, env.APPROVAL_USERNAME) && safeEqual(password, env.APPROVAL_PASSWORD)
    ? env.APPROVAL_USERNAME
    : undefined
}

export class ApprovalError extends Error {
  constructor(readonly code: 'approval_expired' | 'plan_changed' | 'approval_required' | 'invalid_run_state' | 'target_invalid') {
    super(code)
  }
}

async function assertPlanTargetAllowed(run: RunWithPlan): Promise<void> {
  const target = run.plan.preconditions.find(item => item.startsWith('Approved target: '))?.slice('Approved target: '.length)
  if (!target) throw new ApprovalError('plan_changed')
  try {
    await validateTargetUrl(target)
  } catch {
    throw new ApprovalError('target_invalid')
  }
}

export async function decideRunApproval(
  run: RunWithPlan,
  decision: 'approved' | 'rejected',
  approver: string,
  now = new Date(),
): Promise<RunWithPlan> {
  if (run.status !== 'awaiting_approval') throw new ApprovalError('invalid_run_state')

  const timestamp = now.toISOString()
  if (new Date(run.approvalExpiresAt).getTime() <= now.getTime()) {
    await runRepository.expireApproval(run.id, run.planHash, timestamp)
    throw new ApprovalError('approval_expired')
  }

  if (hashPlan(run.plan) !== run.planHash) throw new ApprovalError('plan_changed')
  await assertPlanTargetAllowed(run)
  const record: ApprovalDecision = {
    approver,
    decision,
    decidedAt: timestamp,
    planHash: run.planHash,
  }
  const updated = await runRepository.decideApproval(run.id, run.planHash, record, timestamp)
  if (!updated) {
    const latest = await runRepository.get(run.id)
    if (latest?.status === 'awaiting_approval' && new Date(latest.approvalExpiresAt).getTime() <= now.getTime()) {
      await runRepository.expireApproval(run.id, latest.planHash, timestamp)
      throw new ApprovalError('approval_expired')
    }
    throw new ApprovalError('invalid_run_state')
  }
  return updated
}

export async function claimApprovedRun(runId: string, now = new Date()): Promise<RunWithPlan> {
  const run = await runRepository.get(runId)
  if (!run) throw new ApprovalError('invalid_run_state')
  if (run.status !== 'approved' || run.approval?.decision !== 'approved') {
    throw new ApprovalError('approval_required')
  }
  const currentHash = hashPlan(run.plan)
  if (currentHash !== run.planHash || run.approval.planHash !== run.planHash) {
    throw new ApprovalError('plan_changed')
  }
  await assertPlanTargetAllowed(run)
  const claimed = await runRepository.claimExecution(run.id, run.planHash, now.toISOString())
  if (!claimed) throw new ApprovalError('invalid_run_state')
  return claimed
}

async function requireApprovedPlan(runId: string, expectedStatus: RunWithPlan['status']): Promise<RunWithPlan> {
  const run = await runRepository.get(runId)
  if (!run || run.status !== expectedStatus || run.approval?.decision !== 'approved') {
    throw new ApprovalError('approval_required')
  }
  if (hashPlan(run.plan) !== run.planHash || run.approval.planHash !== run.planHash) {
    throw new ApprovalError('plan_changed')
  }
  return run
}

export async function markRunVerifying(runId: string, evidence: z.infer<typeof ExecutionEvidenceSchema>, now = new Date()): Promise<RunWithPlan> {
  const run = await requireApprovedPlan(runId, 'running')
  const verifying = await runRepository.recordExecution(run.id, run.planHash, evidence, now.toISOString())
  if (!verifying) throw new ApprovalError('invalid_run_state')
  return verifying
}

export async function completeApprovedRun(
  runId: string,
  result: 'reproduced' | 'not_reproduced' | 'inconclusive',
  now = new Date(),
): Promise<RunWithPlan> {
  const run = await requireApprovedPlan(runId, 'verifying')
  const completed = await runRepository.transition(run.id, 'verifying', result, run.planHash, now.toISOString())
  if (!completed) throw new ApprovalError('invalid_run_state')
  return completed
}
