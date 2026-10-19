import { supabase } from './client'
import { RunWithPlanSchema, type RunWithPlan } from '../schemas/run'

export type ApprovalDecision = NonNullable<RunWithPlan['approval']>

const memoryRuns = new Map<string, RunWithPlan>()

export const runRepository = {
  async list(): Promise<RunWithPlan[]> {
    if (!supabase) {
      return [...memoryRuns.values()].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
    const { data, error } = await supabase.from('test_runs').select('run, plan').order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(row => RunWithPlanSchema.parse({ ...row.run, plan: row.plan }))
  },

  async get(id: string): Promise<RunWithPlan | undefined> {
    if (!supabase) return memoryRuns.get(id)
    const { data, error } = await supabase.from('test_runs').select('run, plan').eq('id', id).maybeSingle()
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
    const { error } = await supabase.from('test_runs').insert({
      id: validated.id,
      bug_report_id: validated.bugReportId,
      run: record,
      plan,
      status: validated.status,
      plan_hash: validated.planHash,
      approval_expires_at: validated.approvalExpiresAt,
      approval: validated.approval,
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
    const { data, error } = await supabase.from('test_runs').update({
      run: record,
      status: nextStatus,
      approval: decision,
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
    const { data, error } = await supabase.from('test_runs').update({ run: record, status: 'expired' })
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
    const { data, error } = await supabase.from('test_runs').update({ run: record, status: 'running' })
      .eq('id', id).eq('status', 'approved').eq('plan_hash', expectedPlanHash)
      .select('run, plan').maybeSingle()
    if (error) throw error
    return data ? RunWithPlanSchema.parse({ ...data.run, plan: data.plan }) : undefined
  },

  async transition(id: string, expectedStatus: RunWithPlan['status'], nextStatus: RunWithPlan['status'], expectedPlanHash: string, now: string): Promise<RunWithPlan | undefined> {
    const current = await this.get(id)
    if (!current) return undefined
    const updated = RunWithPlanSchema.parse({ ...current, status: nextStatus, updatedAt: now })
    if (!supabase) {
      const stillCurrent = memoryRuns.get(id)
      if (!stillCurrent || stillCurrent.status !== expectedStatus || stillCurrent.planHash !== expectedPlanHash) return undefined
      memoryRuns.set(id, updated)
      return updated
    }
    const { plan, ...record } = updated
    const { data, error } = await supabase.from('test_runs').update({ run: record, status: nextStatus })
      .eq('id', id).eq('status', expectedStatus).eq('plan_hash', expectedPlanHash)
      .select('run, plan').maybeSingle()
    if (error) throw error
    return data ? RunWithPlanSchema.parse({ ...data.run, plan: data.plan }) : undefined
  },
}
