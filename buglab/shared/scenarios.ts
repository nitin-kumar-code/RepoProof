export const scenarios = [
  {
    id: 'TC1',
    title: 'Duplicate cart item undercounts subtotal',
    initialState: 'Reset the demo store; the cart must be empty.',
    steps: ['Open the home page.', 'Add Alpine Trail Backpack to the cart twice.', 'Open the cart and inspect quantity and subtotal.'],
    expectedResult: 'Cart subtotal equals unit price multiplied by quantity.',
    actualBehavior: "Cart subtotal omits the second item's price.",
    evidence: ['cart quantity', 'cart subtotal', 'TC1 console error', 'two-attempt fingerprint'],
  },
  {
    id: 'TC2',
    title: 'Single-item subtotal report is not reproduced',
    initialState: 'Reset the demo store; the cart must be empty.',
    steps: ['Open the home page.', 'Add Alpine Trail Backpack to the cart once.', 'Open the cart and inspect the subtotal.'],
    expectedResult: 'The subtotal matches the single product price.',
    actualBehavior: 'The subtotal resets to zero after adding one item.',
    evidence: ['cart quantity', 'cart subtotal', 'absence of the reported failure'],
  },
  {
    id: 'TC3',
    title: 'Approved deletion of disposable sandbox records',
    initialState: 'Reset the store to its three synthetic records.',
    steps: ['Select one or more sandbox records.', 'Review the affected IDs and type the displayed confirmation phrase.', 'Approve the exact record set.', 'Execute the one-time approval.'],
    expectedResult: 'Only the approved synthetic records are deleted.',
    actualBehavior: 'Unapproved or stale deletion requests are rejected.',
    evidence: ['record IDs before and after', 'approval timestamp and expiry', 'reset confirmation'],
  },
  {
    id: 'TC4',
    title: 'Synthetic token detection and redaction',
    initialState: 'Open the test-only token panel; no real credentials are used.',
    steps: ['Load the synthetic token fixture.', 'Inspect the visually masked output and redacted test logs.'],
    expectedResult: 'A token-like value is detected and redacted before logs are shared.',
    actualBehavior: 'The synthetic token remains visible in the DOM for controlled inspection.',
    evidence: ['redacted API log record', 'screenshot with sensitive-element mask'],
  },
] as const

export type ScenarioId = typeof scenarios[number]['id']
