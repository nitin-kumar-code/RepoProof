import { apiRequest } from './client'
import type { BugReport } from '../types/bug'

export const getBugs = () => apiRequest<BugReport[]>('/api/bugs')
export const createBug = (bug: Partial<BugReport>) => apiRequest<BugReport>('/api/bugs', { method: 'POST', body: JSON.stringify(bug) })
