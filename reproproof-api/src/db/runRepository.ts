import { supabase } from './client'
import { RunWithPlanSchema, type RunWithPlan } from '../schemas/run'

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
    })
    if (error) throw error
    return validated
  },
}
