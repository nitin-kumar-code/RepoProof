import { z } from 'zod'
import { AgentPlanSchema } from './plan'

export const RunStatusSchema = z.enum([
  'pending',
  'awaiting_approval',
  'approved',
  'cancelled',
  'expired',
  'running',
  'verifying',
  'reproduced',
  'not_reproduced',
  'inconclusive',
  // Retained for records written by the earlier run schema.
  'passed',
  'failed',
  'error',
])

export const ApprovalRecordSchema = z.object({
  approver: z.string().trim().min(1).max(200),
  decision: z.enum(['approved', 'rejected']),
  decidedAt: z.string().datetime(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export const RunSchema = z.object({
  id: z.string().min(1),
  bugReportId: z.string().min(1),
  status: RunStatusSchema,
  browser: z.literal('chromium'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvalExpiresAt: z.string().datetime(),
  approval: ApprovalRecordSchema.nullable(),
}).strict()

export const RunWithPlanSchema = RunSchema.extend({ plan: AgentPlanSchema }).strict()

export type RunRecord = z.infer<typeof RunSchema>
export type RunStatus = z.infer<typeof RunStatusSchema>
export type RunWithPlan = z.infer<typeof RunWithPlanSchema>
