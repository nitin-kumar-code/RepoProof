import { describe, expect, it } from 'vitest'
import { agentPlanSchema, bugCreateResultSchema, evidenceResponseSchema, runSchema } from '../../src/schemas/api'
import { officialScenarios } from '../../src/data/qaScenarios'

const plan = {
  summary: 'Reproduce the profile save error', verificationMode: 'read_only', preconditions: [], clarifications: [],
  steps: [{ stepOrder: 1, instruction: 'Open the profile page', action: { type: 'navigate', url: 'https://demo.example/profile' }, rationale: 'Reach the reported screen', clarification: null }],
  successCriteria: ['Profile saves'], failureCriteria: ['An error appears'],
}
const run = {
  id: 'run-1', bugReportId: 'bug-1', status: 'awaiting_approval', browser: 'chromium', createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z', planHash: 'a'.repeat(64), approvalExpiresAt: '2026-10-21T00:00:00.000Z', approval: null,
  progress: null, execution: null, plan,
}

describe('frontend API contracts', () => {
  it('accepts the backend clarification response and a persisted run', () => {
    expect(bugCreateResultSchema.parse({ status: 'clarification_required', complete: false, clarificationRequests: [{ field: 'steps', question: 'Add steps' }] }).complete).toBe(false)
    expect(runSchema.parse(run).status).toBe('awaiting_approval')
    expect(agentPlanSchema.parse(plan).steps[0].action?.type).toBe('navigate')
  })

  it('rejects unsupported actions, impossible run states and malformed evidence links', () => {
    expect(agentPlanSchema.safeParse({ ...plan, steps: [{ ...plan.steps[0], action: { type: 'script', source: 'alert(1)' } }] }).success).toBe(false)
    expect(runSchema.safeParse({ ...run, status: 'done' }).success).toBe(false)
    expect(evidenceResponseSchema.safeParse({ runId: 'run-1', files: [{ id: 'e1', runId: 'run-1', attemptNumber: 1, type: 'screenshot', storageKey: 'private/key', createdAt: '2026-10-20T00:00:00.000Z', sanitized: true, downloadUrl: 'javascript:alert(1)' }] }).success).toBe(false)
  })

  it('keeps all four official scenarios labeled as unexecuted or safety-blocked until live runs exist', () => {
    expect(officialScenarios.map(scenario => scenario.id)).toEqual(['TC1', 'TC2', 'TC3', 'TC4'])
    expect(officialScenarios[0].checks).toContain('Same failure criteria in both observations')
    expect(officialScenarios[1].detail).toContain('two valid completed attempts')
    expect(officialScenarios[2].status).toBe('Blocked')
    expect(officialScenarios[2].bug).toContain('disposable sandbox')
    expect(officialScenarios[3].checks).toContain('Cookies and API-key patterns covered')
    expect(officialScenarios.filter(scenario => scenario.status !== 'Not Run' && scenario.status !== 'Blocked')).toHaveLength(0)
  })
})
