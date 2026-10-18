export type BugStatus = 'Open' | 'In progress' | 'Resolved'

export interface BugReport {
  id: string
  title: string
  project: string
  status: BugStatus
  updatedAt: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
}
