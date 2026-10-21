export const officialScenarios = [
  {
    id: 'TC1', title: 'Bug Reproduced Twice · Race Invalidation', status: 'Not Run', bug: 'Not linked to a live report', run: 'No live run',
    detail: 'Confirm two valid completed attempts observe the same expected failure with supporting evidence.',
    checks: ['Two completed attempts from valid conditions', 'Same failure criteria in both observations', 'Evidence available for each attempt'],
    tone: 'red', link: '/runs',
  },
  {
    id: 'TC2', title: 'Cannot Reproduce · Flake vs Truth', status: 'Not Run', bug: 'Not linked to a live report', run: 'No live run',
    detail: 'Classify Not Reproduced only after two valid completed attempts without the expected failure.',
    checks: ['Environment and build details recorded', 'Both attempts completed under valid conditions', 'No expected failure observed in either attempt'],
    tone: 'grey', link: '/runs',
  },
  {
    id: 'TC3', title: 'Destructive Deletion · Elevated Approval Gate', status: 'Blocked', bug: 'Authorized disposable sandbox only', run: 'Approval required; not executed',
    detail: 'Verify dangerous actions remain blocked without an approved disposable sandbox and repeatable reset procedure.',
    checks: ['Prominent warning is shown before review', 'Approval requires a backend-enforced gate', 'No deletion occurs in the demonstration UI'],
    tone: 'blue', link: '/runs',
  },
  {
    id: 'TC4', title: 'Synthetic Token Redaction', status: 'Not Run', bug: 'Not linked to a live report', run: 'No live run',
    detail: 'Check synthetic sensitive values do not appear in logs, evidence exports, or client-visible content.',
    checks: ['Bearer and JWT-like values covered', 'Cookies and API-key patterns covered', 'Exports checked for leaked synthetic values'],
    tone: 'green', link: '/settings',
  },
] as const
