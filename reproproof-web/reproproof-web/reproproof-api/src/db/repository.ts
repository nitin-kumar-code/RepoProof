import { supabase } from './client'
import type { BugReport } from '../schemas/bug'

const memoryReports = new Map<string, BugReport>()

export const bugRepository = {
  async list(): Promise<BugReport[]> {
    if (!supabase) {
      return [...memoryReports.values()].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
    const { data, error } = await supabase.from('bug_reports').select('report').order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(row => row.report as BugReport)
  },

  async get(id: string): Promise<BugReport | undefined> {
    if (!supabase) return memoryReports.get(id)
    const { data, error } = await supabase.from('bug_reports').select('report').eq('id', id).maybeSingle()
    if (error) throw error
    return data?.report as BugReport | undefined
  },

  async save(report: BugReport): Promise<BugReport> {
    if (!supabase) {
      memoryReports.set(report.id, report)
      return report
    }
    const { error } = await supabase.from('bug_reports').insert({
      id: report.id,
      report,
    })
    if (error) throw error
    return report
  },
}
