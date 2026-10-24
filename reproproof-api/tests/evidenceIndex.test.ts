import { describe, expect, it } from 'vitest'
import { mergeEvidenceRecords } from '../src/db/runRepository'
import type { RunWithPlan } from '../src/schemas/run'

type EvidenceRecord = NonNullable<RunWithPlan['execution']>['evidenceRecords'][number]

function record(id: string, storageKey: string): EvidenceRecord {
  return {
    id,
    runId: 'run-1',
    attemptNumber: 1,
    type: 'screenshot',
    storageKey,
    createdAt: '2026-10-24T00:00:00.000Z',
    sanitized: true,
  }
}

describe('evidence metadata recovery', () => {
  it('serves records saved in the run snapshot when the evidence index is empty', () => {
    const snapshot = [record('shot-1', 'run-1/attempt-1/shot.png')]
    expect(mergeEvidenceRecords([], snapshot)).toEqual(snapshot)
  })

  it('merges a partial index with the run snapshot without duplicate IDs', () => {
    const indexed = [record('shot-1', 'run-1/attempt-1/shot.png')]
    const snapshot = [indexed[0], record('shot-2', 'run-1/attempt-2/shot.png')]
    expect(mergeEvidenceRecords(indexed, snapshot)).toEqual(snapshot)
  })
})
