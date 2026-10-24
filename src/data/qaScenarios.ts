export const officialScenarios = [
  {
    id: 'TC1', title: 'Bug Reproduced Twice · Duplicate cart subtotal', expectedVerdict: 'reproduced', status: 'Not Run', bug: 'BugLab controlled demo target', run: 'No live run',
    detail: 'Reset the cart before each attempt; confirm both completed attempts observe the same subtotal failure and normalized fingerprint.',
    checks: ['Two completed attempts from valid conditions', 'Same failure criteria in both observations', 'Evidence available for each attempt'],
    tone: 'red', link: '/runs',
  },
  {
    id: 'TC2', title: 'Cannot Reproduce · Single-item subtotal', expectedVerdict: 'not_reproduced', status: 'Not Run', bug: 'BugLab controlled demo target', run: 'No live run',
    detail: 'Classify Not Reproduced only after two valid completed attempts without the expected failure.',
    checks: ['Environment and build details recorded', 'Both attempts completed under valid conditions', 'No expected failure observed in either attempt'],
    tone: 'grey', link: '/runs',
  },
  {
    id: 'TC3', title: 'Destructive Deletion · Exact sandbox approval', expectedVerdict: 'reproduced', status: 'Not Run', bug: 'BugLab synthetic fixtures only', run: 'No live run',
    detail: 'Exercise direct API rejection, exact action and record approval, replay protection, and reset between attempts.',
    checks: ['Unapproved API delete is rejected', 'One-time approval binds exact action and record set', 'Reset restores synthetic seed records'],
    tone: 'blue', link: '/runs',
  },
  {
    id: 'TC4', title: 'Synthetic Token Redaction', expectedVerdict: 'reproduced', status: 'Not Run', bug: 'Synthetic fixture only', run: 'No live run',
    detail: 'Check synthetic sensitive values do not appear in logs, evidence exports, or client-visible content.',
    checks: ['Logs and exported reports are scanned for the synthetic token', 'Screenshots use Playwright locator masking', 'Video capture is disabled without a frame-safe redaction pipeline'],
    tone: 'green', link: '/settings',
  },
] as const
