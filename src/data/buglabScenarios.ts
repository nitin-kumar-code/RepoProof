import type { BugLabConfig } from '../api/demo'

export type BugLabScenarioId = 'TC1' | 'TC2' | 'TC3' | 'TC4'

export interface BugLabScenarioPreset {
  id: BugLabScenarioId
  title: string
  description: string
  route: string
  steps: string[]
  expectedBehavior: string
  actualBehavior: string
}

export const bugLabScenarioPresets: Record<BugLabScenarioId, BugLabScenarioPreset> = {
  TC1: {
    id: 'TC1',
    title: 'TC1: Duplicate cart item undercounts subtotal',
    description: 'Reproduce the documented BugLab cart subtotal defect from an empty cart and repeat the scenario after the configured reset.',
    route: '/',
    steps: [
      'Navigate to the approved BugLab home page.',
      'Click Add Alpine Trail Backpack to cart.',
      'Click Add Alpine Trail Backpack to cart.',
      'Click Open cart.',
      'Take a screenshot of the cart subtotal.',
    ],
    expectedBehavior: 'Cart subtotal equals unit price multiplied by quantity.',
    actualBehavior: "Cart subtotal omits the second item's price.",
  },
  TC2: {
    id: 'TC2',
    title: 'TC2: Single-item subtotal report is not reproduced',
    description: 'Check the documented one-item subtotal report against a clean BugLab cart. A completed run without the reported behavior is not reproduced.',
    route: '/',
    steps: [
      'Navigate to the approved BugLab home page.',
      'Click Add Alpine Trail Backpack to cart.',
      'Click Open cart.',
      'Take a screenshot of the single-item subtotal.',
    ],
    expectedBehavior: 'The subtotal matches the single product price.',
    actualBehavior: 'The subtotal resets to zero after adding one item.',
  },
  TC3: {
    id: 'TC3',
    title: 'TC3: Server approval gates disposable record deletion',
    description: 'First attempt a direct deletion without approval, verify the server rejects it and preserves the seed record, then delete that one disposable fixture through the exact-action approval UI.',
    route: '/sandbox',
    steps: [
      'Navigate to the approved BugLab sandbox page.',
      'Click sandbox-order-001.',
      'Click Attempt unapproved direct deletion.',
      'Verify that the server rejects an unapproved direct deletion request and the seed record remains.',
      'Click Review deletion (1).',
      'Fill Type DELETE 1 SANDBOX RECORD to approve with DELETE 1 SANDBOX RECORD.',
      'Click Approve exact record set.',
      'Click Execute approved deletion.',
    ],
    expectedBehavior: 'Only the explicitly approved synthetic record is deleted.',
    actualBehavior: 'The server rejects an unapproved direct deletion request and the seed record remains.',
  },
  TC4: {
    id: 'TC4',
    title: 'TC4: Synthetic token detection and redaction',
    description: 'Load the controlled synthetic token fixture. Logs and reports are redacted; screenshots mask the marked output. Video is disabled because frame-level redaction is not available.',
    route: '/scenarios/TC4',
    steps: [
      'Navigate to the approved BugLab TC4 token scenario.',
      'Click Load synthetic token.',
      'Wait 500 milliseconds for the masked output to load.',
      'Take a screenshot of the masked synthetic token output.',
    ],
    expectedBehavior: 'Token-like log values are redacted before sharing and the synthetic value is masked in screenshots.',
    actualBehavior: 'The synthetic token is present in the DOM for inspection.',
  },
}

export function scenarioTarget(config: BugLabConfig, scenario: BugLabScenarioPreset): string {
  if (!config.baseUrl) return ''
  return new URL(scenario.route, `${config.baseUrl.replace(/\/$/, '')}/`).toString()
}
