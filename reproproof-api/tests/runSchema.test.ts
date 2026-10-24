import { describe, expect, it } from 'vitest'
import { RunProgressSchema } from '../src/schemas/run'

describe('RunProgressSchema', () => {
  it('accepts ISO timestamps emitted by Postgres with a UTC offset', () => {
    const progress = {
      phase: 'queued',
      currentAttempt: null,
      completedAttempts: 0,
      completedActions: 0,
      totalActions: 2,
      message: 'Waiting for an available browser worker',
      updatedAt: '2026-10-21T06:21:00+00:00',
    }

    expect(RunProgressSchema.parse(progress).updatedAt).toBe(progress.updatedAt)
  })
})
