import { apiRequest } from './client'
import type { RunRecord } from '../types/run'

export const createRun = (bugReportId: string) => apiRequest<RunRecord>('/api/runs', {
  method: 'POST',
  body: JSON.stringify({ bugReportId }),
})
export const getRuns = () => apiRequest<RunRecord[]>('/api/runs')
export const getRun = (id: string) => apiRequest<RunRecord>(`/api/runs/${encodeURIComponent(id)}`)
