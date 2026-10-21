import { apiRequest } from './client'
import type { BugCreateResult, BugReport, BugReportSubmission } from '../types/bug'
import { bugCreateResultSchema, bugReportSchema } from '../schemas/api'

export const getBugs = (signal?: AbortSignal) => apiRequest<BugReport[]>('/api/bugs', { signal }, bugReportSchema.array())
export const getBug = (id: string, signal?: AbortSignal) => apiRequest<BugReport>(`/api/bugs/${encodeURIComponent(id)}`, { signal }, bugReportSchema)
export const createBug = (bug: BugReportSubmission) => apiRequest<BugCreateResult>('/api/bugs', { method: 'POST', body: JSON.stringify(bug) }, bugCreateResultSchema)
