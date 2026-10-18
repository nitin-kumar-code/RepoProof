import { apiRequest } from './client'
import type { TestRun } from '../types/run'

export const getRuns = () => apiRequest<TestRun[]>('/api/runs')
export const getRun = (id: string) => apiRequest<TestRun>(`/api/runs/${encodeURIComponent(id)}`)
