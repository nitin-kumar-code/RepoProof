import { apiRequest } from './client'
import type { RunRecord } from '../types/run'

export const createRun = (bugReportId: string) => apiRequest<RunRecord>('/api/runs', {
  method: 'POST',
  body: JSON.stringify({ bugReportId }),
})
export const getRuns = () => apiRequest<RunRecord[]>('/api/runs')
export const getRun = (id: string, signal?: AbortSignal) => apiRequest<RunRecord>(`/api/runs/${encodeURIComponent(id)}`, { signal })
export const executeRun = (id: string) => apiRequest<RunRecord>(`/api/runs/${encodeURIComponent(id)}/execute`, {
  method: 'POST',
})
export const decideRunApproval = (id: string, decision: 'approved' | 'rejected', username: string, password: string) =>
  apiRequest<RunRecord>(`/api/runs/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(encodeURIComponent(`${username}:${password}`).replace(/%([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))))}`,
    },
    body: JSON.stringify({ decision }),
  })
