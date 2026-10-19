import type { BugReport } from '../schemas/bug'

// Temporary in-process repository for the contract checkpoint. Replace with
// durable storage before relying on reports across server restarts.
const bugReports = new Map<string, BugReport>()

export const bugRepository = {
  list(): BugReport[] {
    return [...bugReports.values()]
  },
  get(id: string): BugReport | undefined {
    return bugReports.get(id)
  },
  save(report: BugReport): BugReport {
    bugReports.set(report.id, report)
    return report
  },
}
