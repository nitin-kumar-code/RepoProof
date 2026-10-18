import { z } from 'zod'
import { AgentPlanSchema } from './plan'

export const RunStatusSchema = z.enum([
  'pending',
  'awaiting_approval',
  'approved',
  'running',
  'passed',
  'failed',
  'error',
])

export const RunSchema = z.object({
  id: z.string().min(1),
  bugReportId: z.string().min(1),
  status: RunStatusSchema,
  browser: z.literal('chromium'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()

export const RunWithPlanSchema = RunSchema.extend({ plan: AgentPlanSchema }).strict()

export type RunRecord = z.infer<typeof RunSchema>
export type RunStatus = z.infer<typeof RunStatusSchema>
export type RunWithPlan = z.infer<typeof RunWithPlanSchema>
