export interface ReproductionStep {
  order: number
  instruction: string
}

export interface BugEnvironment {
  targetUrl: string
  browser: 'chromium'
  appVersion?: string
  operatingSystem?: string
}

/** Complete report contract shared with the API and future planner/runner. */
export interface BugReport {
  id: string
  title: string
  description: string
  steps: ReproductionStep[]
  expectedBehavior: string
  actualBehavior: string
  environment: BugEnvironment
  createdAt: string
}

export interface BugReportSubmission {
  title: string
  description: string
  steps?: ReproductionStep[]
  expectedBehavior?: string
  actualBehavior?: string
  environment: { targetUrl?: string; browser: 'chromium'; appVersion?: string; operatingSystem?: string }
}

export type BugCreateResult =
  | { status: 'clarification_required'; complete: false; clarificationRequests: Array<{ field: string; question: string }> }
  | { id: string; status: 'created'; complete: true; bugReport: BugReport }

export type BugStatus = 'Open' | 'In progress' | 'Resolved'
export interface BugSummary {
  id: string
  title: string
  project: string
  status: BugStatus
  updatedAt: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
}
