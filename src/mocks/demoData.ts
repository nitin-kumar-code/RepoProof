import type { BugSummary } from '../types/bug'
import type { TestRun } from '../types/run'

export const bugs: BugSummary[] = [
  { id: 'BUG-248', title: 'Checkout button is unresponsive on Safari', project: 'Storefront', status: 'In progress', updatedAt: '12 min ago', severity: 'High' },
  { id: 'BUG-247', title: 'Profile image upload fails for large files', project: 'Accounts', status: 'Open', updatedAt: '1 hour ago', severity: 'Medium' },
  { id: 'BUG-246', title: 'Search results are missing pagination', project: 'Storefront', status: 'Open', updatedAt: '3 hours ago', severity: 'Low' },
  { id: 'BUG-245', title: 'Payment confirmation email is delayed', project: 'Payments', status: 'Resolved', updatedAt: 'Yesterday', severity: 'Critical' },
]

export const runs: TestRun[] = [
  { id: 'RUN-891', title: 'Checkout flow · Safari 17', project: 'Storefront', status: 'Failed', duration: '2m 14s', time: '10 min ago' },
  { id: 'RUN-890', title: 'User sign up · Chrome 128', project: 'Accounts', status: 'Passed', duration: '1m 08s', time: '34 min ago' },
  { id: 'RUN-889', title: 'Payment with saved card', project: 'Payments', status: 'Needs approval', duration: '—', time: '1 hour ago' },
]
