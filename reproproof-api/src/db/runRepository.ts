import { supabase } from './client'
import { ExecutionEvidenceSchema, RunProgressSchema, RunWithPlanSchema, type RunWithPlan } from '../schemas/run'

export type ApprovalDecision = NonNullable<RunWithPlan['approval']>

const memoryRuns = new Map<string, RunWithPlan>()

export const runRepository = {
  async list(): Promise<RunWithPlan[]> {
    if (!supabase) {
      return [...memoryRuns.values()].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
    const { data, error } = await supabase.from('runs').select('run, plan').order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(row => RunWithPlanSchema.parse({ ...row.run, plan: row.plan }))
  },

  async get(id: string): Promise<RunWithPlan | undefined> {
    if (!supabase) return memoryRuns.get(id)
    const { data, error } = await supabase.from('runs').select('run, plan').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? RunWithPlanSchema.parse({ ...data.run, plan: data.plan }) : undefined
  },

  async findActiveForBug(bugReportId: string): Promise<RunWithPlan | undefined> {
    if (!supabase) return [...memoryRuns.values()].find(run => run.bugReportId === bugReportId
      && ['awaiting_approval', 'approved', 'running', 'verifying'].includes(run.status))
    const { data, error } = await supabase.from('runs').select('run, plan').eq('bug_report_id', bugReportId)
      .in('status', ['awaiting_approval', 'approved', 'running', 'verifying']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return data ? RunWithPlanSchema.parse({ ...data.run, plan: data.plan }) : undefined
  },

  async save(run: RunWithPlan): Promise<RunWithPlan> {
    const validated = RunWithPlanSchema.parse(run)
    if (!supabase) {
      memoryRuns.set(validated.id, validated)
      return validated
    }
    const { plan, ...record } = validated
    const { error } = await supabase.from('runs').insert({
      id: validated.id,
      bug_report_id: validated.bugReportId,
      run: record,
      plan,
      status: validated.status,
      plan_hash: validated.planHash,
      approval_expires_at: validated.approvalExpiresAt,
      approval: validated.approval,
      updated_at: validated.updatedAt,
    })
    if (error) throw error
    return validated
  },

  async decideApproval(id: string, expectedPlanHash: string, decision: ApprovalDecision, now: string): Promise<RunWithPlan | undefined> {
    const current = await this.get(id)
    if (!current) return undefined
    const nextStatus = decision.decision === 'approved' ? 'approved' : 'cancelled'
    const updated = RunWithPlanSchema.parse({ ...current, status: nextStatus, approval: decision, updatedAt: now })
    if (!supabase) {
      const stillCurrent = memoryRuns.get(id)
      if (!stillCurrent || stillCurrent.status !== 'awaiting_approval'
        || stillCurrent.planHash !== expectedPlanHash
        || new Date(stillCurrent.approvalExpiresAt).getTime() <= new Date(now).getTime()) return undefined
      memoryRuns.set(id, updated)
      return updated
    }

    const { plan, ...record } = updated
    const { data, error } = await supabase.from('runs').update({
      run: record,
      status: nextStatus,
      approval: decision,
      updated_at: now,
    }).eq('id', id).eq('status', 'awaiting_approval').eq('plan_hash', expectedPlanHash)
      .gt('approval_expires_at', now).select('run, plan').maybeSingle()
    if (error) throw error
    return data ? RunWithPlanSchema.parse({ ...data.run, plan: data.plan }) : undefined
  },

  async expireApproval(id: string, expectedPlanHash: string, now: string): Promise<RunWithPlan | undefined> {
    const current = await this.get(id)
    if (!current) return undefined
    const updated = RunWithPlanSchema.parse({ ...current, status: 'expired', updatedAt: now })
    if (!supabase) {
      const stillCurrent = memoryRuns.get(id)
      if (!stillCurrent || stillCurrent.status !== 'awaiting_approval'
        || stillCurrent.planHash !== expectedPlanHash
        || new Date(stillCurrent.approvalExpiresAt).getTime() > new Date(now).getTime()) return undefined
      memoryRuns.set(id, updated)
      return updated
    }
    const { plan, ...record } = updated
    const { data, error } = await supabase.from('runs').update({ run: record, status: 'expired', updated_at: now })
      .eq('id', id).eq('status', 'awaiting_approval').eq('plan_hash', expectedPlanHash)
      .lte('approval_expires_at', now).select('run, plan').maybeSingle()
    if (error) throw error
    return data ? RunWithPlanSchema.parse({ ...data.run, plan: data.plan }) : undefined
  },

  async claimExecution(id: string, expectedPlanHash: string, now: string): Promise<RunWithPlan | undefined> {
    const current = await this.get(id)
    if (!current) return undefined
    const updated = RunWithPlanSchema.parse({ ...current, status: 'running', updatedAt: now })
    if (!supabase) {
      const stillCurrent = memoryRuns.get(id)
      if (!stillCurrent || stillCurrent.status !== 'approved' || stillCurrent.planHash !== expectedPlanHash) return undefined
      memoryRuns.set(id, updated)
      return updated
    }
    const { plan, ...record } = updated
    const { data, error } = await supabase.from('runs').update({ run: record, status: 'running', updated_at: now })
      .eq('id', id).eq('status', 'approved').eq('plan_hash', expectedPlanHash)
      .select('run, plan').maybeSingle()
    if (error) throw error
    return data ? RunWithPlanSchema.parse({ ...data.run, plan: data.plan }) : undefined
  },

  async updateProgress(id: string, expectedPlanHash: string, progress: NonNullable<RunWithPlan['progress']>): Promise<RunWithPlan | undefined> {
    const validatedProgress = RunProgressSchema.parse(progress)
    const current = await this.get(id)
    if (!current || current.status !== 'running' || current.planHash !== expectedPlanHash) return undefined
    const updated = RunWithPlanSchema.parse({ ...current, progress: validatedProgress, updatedAt: validatedProgress.updatedAt })
    if (!supabase) {
      const stillCurrent = memoryRuns.get(id)
      if (!stillCurrent || stillCurrent.status !== 'running' || stillCurrent.planHash !== expectedPlanHash) return undefined
      memoryRuns.set(id, updated)
      return updated
    }
    const { plan, ...record } = updated
    const { data, error } = await supabase.from('runs').update({ run: record, updated_at: validatedProgress.updatedAt })
      .eq('id', id).eq('status', 'running').eq('plan_hash', expectedPlanHash).select('run, plan').maybeSingle()
    if (error) throw error
    return data ? RunWithPlanSchema.parse({ ...data.run, plan: data.plan }) : undefined
  },

  async recordExecution(id: string, expectedPlanHash: string, evidence: RunWithPlan['execution'], now: string): Promise<RunWithPlan | undefined> {
    const validatedEvidence = ExecutionEvidenceSchema.parse(evidence)
    const current = await this.get(id)
    if (!current) return undefined
    const updated = RunWithPlanSchema.parse({ ...current, status: 'verifying', execution: validatedEvidence, updatedAt: now })
    if (!supabase) {
      const stillCurrent = memoryRuns.get(id)
      if (!stillCurrent || stillCurrent.status !== 'running' || stillCurrent.planHash !== expectedPlanHash) return undefined
      memoryRuns.set(id, updated)
      return updated
    }
    const { plan, ...record } = updated
    const { data, error } = await supabase.from('runs').update({ run: record, status: 'verifying', updated_at: now })
      .eq('id', id).eq('status', 'running').eq('plan_hash', expectedPlanHash)
      .select('run, plan').maybeSingle()
    if (error) throw error
    if (!data) return undefined
    const saved = RunWithPlanSchema.parse({ ...data.run, plan: data.plan })
    await persistExecutionRows(saved)
    return saved
  },

  async transition(id: string, expectedStatus: RunWithPlan['status'], nextStatus: RunWithPlan['status'], expectedPlanHash: string, now: string): Promise<RunWithPlan | undefined> {
    const current = await this.get(id)
    if (!current) return undefined
    const terminal = ['reproduced', 'not_reproduced', 'inconclusive', 'failed'].includes(nextStatus)
    const updated = RunWithPlanSchema.parse({ ...current, status: nextStatus, updatedAt: now,
      ...(terminal ? { progress: { phase: 'completed', currentAttempt: null, completedAttempts: current.execution?.attempts.length ?? 0,
        message: nextStatus === 'failed' ? 'Execution failed; inspect the error and evidence' : 'Verification complete', updatedAt: now } } : {}),
    })
    if (!supabase) {
      const stillCurrent = memoryRuns.get(id)
      if (!stillCurrent || stillCurrent.status !== expectedStatus || stillCurrent.planHash !== expectedPlanHash) return undefined
      memoryRuns.set(id, updated)
      return updated
    }
    const { plan, ...record } = updated
    const { data, error } = await supabase.from('runs').update({ run: record, status: nextStatus, updated_at: now })
      .eq('id', id).eq('status', expectedStatus).eq('plan_hash', expectedPlanHash)
      .select('run, plan').maybeSingle()
    if (error) throw error
    return data ? RunWithPlanSchema.parse({ ...data.run, plan: data.plan }) : undefined
  },
}

export async function listRunsInStatus(status: RunWithPlan['status']): Promise<RunWithPlan[]> {
  if (!supabase) return [...memoryRuns.values()].filter(run => run.status === status)
  const { data, error } = await supabase.from('runs').select('run, plan').eq('status', status)
  if (error) throw error
  return (data ?? []).map(row => RunWithPlanSchema.parse({ ...row.run, plan: row.plan }))
}

async function persistExecutionRows(run: RunWithPlan): Promise<void> {
  if (!supabase || !run.execution) return
  for (const attempt of run.execution.attempts) {
    const attemptId = `${run.id}:${attempt.attemptNumber}`
    const { error: attemptError } = await supabase.from('attempts').upsert({
      id: attemptId,
      run_id: run.id,
      attempt_number: attempt.attemptNumber,
      status: attempt.completed ? 'completed' : attempt.error ? 'failed' : 'inconclusive',
      result: attempt,
      fingerprint: attempt.fingerprint,
      fingerprint_hash: attempt.fingerprint?.hash ?? null,
      started_at: attempt.startedAt,
      completed_at: attempt.completedAt,
    }, { onConflict: 'run_id,attempt_number' })
    if (attemptError) throw attemptError
  }
  const records = run.execution.evidenceRecords
  if (records.length) {
    const attemptIds = new Map(run.execution.attempts.map(attempt => [attempt.attemptNumber, `${run.id}:${attempt.attemptNumber}`]))
    const rows = records.map(record => ({
      id: record.id,
      run_id: run.id,
      attempt_id: attemptIds.get(record.attemptNumber) ?? null,
      attempt_number: record.attemptNumber,
      type: record.type,
      storage_key: record.storageKey,
      sanitized: record.sanitized,
      metadata: {},
      created_at: record.createdAt,
    }))
    const { error: evidenceError } = await supabase.from('evidence_files').upsert(rows, { onConflict: 'id' })
    if (evidenceError) throw evidenceError
  }
}

export async function listEvidenceRecords(runId: string): Promise<Array<{
  id: string; runId: string; attemptNumber: number; type: 'video' | 'screenshot' | 'console' | 'network' | 'report';
  storageKey: string; createdAt: string; sanitized: boolean;
}>> {
  if (!supabase) {
    const run = memoryRuns.get(runId)
    return run?.execution?.evidenceRecords ?? []
  }
  const { data, error } = await supabase.from('evidence_files')
    .select('id, run_id, attempt_number, type, storage_key, created_at, sanitized')
    .eq('run_id', runId).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(row => ({ id: row.id, runId: row.run_id, attemptNumber: row.attempt_number,
    type: row.type, storageKey: row.storage_key, createdAt: row.created_at, sanitized: row.sanitized }))
}
