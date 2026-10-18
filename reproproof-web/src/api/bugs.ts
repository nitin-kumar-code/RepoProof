import { apiRequest } from './client'
import type { BugCreateResult, BugReport, BugReportSubmission } from '../types/bug'

export const getBugs = () => apiRequest<BugReport[]>('/api/bugs')
export const createBug = (bug: BugReportSubmission) => apiRequest<BugCreateResult>('/api/bugs', { method: 'POST', body: JSON.stringify(bug) })
