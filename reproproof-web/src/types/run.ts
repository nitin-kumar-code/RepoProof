export type RunStatus = 'Passed' | 'Failed' | 'Running' | 'Needs approval'

export interface TestRun {
  id: string
  title: string
  project: string
  status: RunStatus
  duration: string
  time: string
}

export type PlanLocator =
  | { kind: 'role'; role: 'button' | 'link' | 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'option' | 'heading' | 'img' | 'dialog' | 'alert' | 'tab' | 'tabpanel' | 'menuitem' | 'switch' | 'searchbox' | 'gridcell'; name: string }
  | { kind: 'label' | 'placeholder' | 'text'; text: string }
  | { kind: 'test_id'; value: string }

export type PlanAssertion =
  | { type: 'visible'; locator: PlanLocator }
  | { type: 'text'; locator: PlanLocator; expected: string }
  | { type: 'url'; expected: string }
  | { type: 'expected_failure_observed'; description: string }

export type PlanAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; locator: PlanLocator }
  | { type: 'fill'; locator: PlanLocator; value: string }
  | { type: 'select'; locator: PlanLocator; value: string }
  | { type: 'wait'; milliseconds: number }
  | { type: 'screenshot'; label: string }
  | { type: 'assert'; assertion: PlanAssertion }

export interface PlannedStep {
  stepOrder: number
  instruction: string
  action: PlanAction | null
  rationale: string
  clarification: string | null
}

/** Structured, non-executable plan contract mirrored by the API Zod schema. */
export interface AgentPlan {
  summary: string
  preconditions: string[]
  clarifications: string[]
  steps: PlannedStep[]
  successCriteria: string[]
  failureCriteria: string[]
}

export interface RunApproval {
  approver: string
  decision: 'approved' | 'rejected'
  decidedAt: string
  planHash: string
}

export interface RunRecord {
  id: string
  bugReportId: string
  status: 'pending' | 'awaiting_approval' | 'approved' | 'cancelled' | 'expired' | 'running' | 'verifying' | 'reproduced' | 'not_reproduced' | 'inconclusive' | 'passed' | 'failed' | 'error'
  browser: 'chromium'
  createdAt: string
  updatedAt: string
  planHash: string
  approvalExpiresAt: string
  approval: RunApproval | null
  plan: AgentPlan
}
