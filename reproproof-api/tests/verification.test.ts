import { describe, expect, it } from 'vitest'
import { createFailureFingerprint } from '../src/browser/fingerprint'
import { determineVerdict, planRequiresReset } from '../src/services/verifier'
import { VerificationAttemptSchema } from '../src/schemas/run'
import type { AgentPlan, PlanAction } from '../src/schemas/plan'

function attempt(attemptNumber: number, completed: boolean, expectedFailureFound: boolean, hash: string | null) {
  return VerificationAttemptSchema.parse({
    attemptNumber,
    startedAt: '2026-10-20T00:00:00.000Z',
    completedAt: '2026-10-20T00:00:01.000Z',
    completed,
    expectedFailureFound,
    fingerprint: hash ? {
      hash,
      route: '/profile',
      criterionId: 'profile-save-error',
      failureType: 'visible_text',
      message: 'Profile save failed',
      request: null,
    } : null,
    result: expectedFailureFound ? 'reproduced' : completed ? 'not_reproduced' : 'inconclusive',
    artifactDirectory: `artifacts/runs/run/attempt-${attemptNumber}`,
    files: [],
    evidenceRecords: [],
    telemetry: [],
    error: null,
  })
}

describe('repeatability verdict', () => {
  it('reproduces only the same expected failure in two completed attempts', () => {
    expect(determineVerdict(attempt(1, true, true, 'a'.repeat(64)), attempt(2, true, true, 'a'.repeat(64)))).toBe('reproduced')
  })

  it('marks two clean completed attempts not reproduced', () => {
    expect(determineVerdict(attempt(1, true, false, null), attempt(2, true, false, null))).toBe('not_reproduced')
  })

  it('returns inconclusive for inconsistent failures, mismatched fingerprints or incomplete attempts', () => {
    expect(determineVerdict(attempt(1, true, true, 'a'.repeat(64)), attempt(2, true, false, null))).toBe('inconclusive')
    expect(determineVerdict(attempt(1, true, true, 'a'.repeat(64)), attempt(2, true, true, 'b'.repeat(64)))).toBe('inconclusive')
    expect(determineVerdict(attempt(1, false, true, 'a'.repeat(64)), attempt(2, true, true, 'a'.repeat(64)))).toBe('inconclusive')
  })
})

describe('reset policy selection', () => {
  const planWith = (action: PlanAction): AgentPlan => ({
    summary: 'Verify the report',
    verificationMode: 'read_only',
    preconditions: [],
    clarifications: [],
    steps: [{ stepOrder: 1, instruction: 'Perform the approved step', action, rationale: 'Check the reported behavior', clarification: null }],
    successCriteria: ['Expected behavior'],
    failureCriteria: ['Reported failure'],
  })

  it('allows read-only navigation and observation without a reset endpoint', () => {
    expect(planRequiresReset(planWith({ type: 'navigate', url: 'https://demo.example/' }))).toBe(false)
    expect(planRequiresReset(planWith({ type: 'wait', milliseconds: 250 }))).toBe(false)
    expect(planRequiresReset(planWith({ type: 'screenshot', label: 'initial state' }))).toBe(false)
  })

  it('requires a reset endpoint when the plan interacts with application state', () => {
    expect(planRequiresReset(planWith({ type: 'click', locator: { kind: 'text', text: 'Save' } }))).toBe(true)
    expect(planRequiresReset(planWith({ type: 'fill', locator: { kind: 'label', text: 'Name' }, value: 'Synthetic' }))).toBe(true)
    expect(planRequiresReset(planWith({ type: 'select', locator: { kind: 'label', text: 'Region' }, value: 'west' }))).toBe(true)
  })
})

describe('failure fingerprint normalization', () => {
  it('normalizes volatile IDs and timestamps into a stable SHA-256 fingerprint', () => {
    const first = createFailureFingerprint({
      route: '/profile/123456789012',
      criterionId: 'profile-save-error',
      failureType: 'console_error',
      message: 'Profile save failed request_id=abc123 at 2026-10-20T00:00:01.000Z',
    })
    const second = createFailureFingerprint({
      route: '/profile/987654321098',
      criterionId: 'profile-save-error',
      failureType: 'console_error',
      message: 'Profile save failed request_id=xyz987 at 2026-10-20T01:23:45.000Z',
    })
    expect(first.route).toBe('/profile/:id')
    expect(first.hash).toBe(second.hash)
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
