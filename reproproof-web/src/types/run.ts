export type RunStatus = 'Passed' | 'Failed' | 'Running' | 'Needs approval'

export interface TestRun {
  id: string
  title: string
  project: string
  status: RunStatus
  duration: string
  time: string
}
