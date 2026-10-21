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
  'failed',
  // Retained for records written by the earlier run schema.
  'passed',
  'error',
])

export const ApprovalRecordSchema = z.object({
  approver: z.string().trim().min(1).max(200),
  decision: z.enum(['approved', 'rejected']),
  decidedAt: z.string().datetime(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export const EvidenceReferenceSchema = z.object({
  kind: z.enum(['screenshot', 'recording', 'telemetry']),
  file: z.string().min(1),
  actionNumber: z.number().int().positive().nullable(),
  timestamp: z.string().datetime(),
}).strict()

export const EvidenceRecordSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().min(1),
  attemptNumber: z.number().int().positive(),
  type: z.enum(['video', 'screenshot', 'console', 'network', 'report']),
  storageKey: z.string().min(1).max(500),
  createdAt: z.string().datetime(),
  sanitized: z.boolean(),
}).strict()

export const TelemetryEventSchema = z.object({
  type: z.enum(['console_error', 'page_error', 'request_failed', 'http_failure']),
  timestamp: z.string().datetime(),
  message: z.string().max(2000).optional(),
  severity: z.string().max(40).optional(),
  method: z.string().max(20).optional(),
  url: z.string().max(2000).optional(),
  status: z.number().int().min(100).max(599).optional(),
  failure: z.string().max(500).optional(),
}).strict()

export const FailureFingerprintSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  route: z.string().max(1000),
  criterionId: z.string().min(1).max(100),
  failureType: z.enum(['visible_text', 'console_error', 'page_error', 'request_failed', 'http_failure']),
  message: z.string().max(1000),
  request: z.object({ method: z.string().max(20), path: z.string().max(1000), status: z.number().int().min(100).max(599).nullable() }).strict().nullable(),
}).strict()

export const VerificationAttemptSchema = z.object({
  attemptNumber: z.number().int().positive(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  completed: z.boolean(),
  expectedFailureFound: z.boolean(),
  fingerprint: FailureFingerprintSchema.nullable(),
  result: z.enum(['reproduced', 'not_reproduced', 'inconclusive']),
  artifactDirectory: z.string().min(1),
  files: z.array(EvidenceReferenceSchema).max(500),
  evidenceRecords: z.array(EvidenceRecordSchema).max(500),
  telemetry: z.array(TelemetryEventSchema).max(500),
  error: z.string().max(2000).nullable(),
}).strict()

export const ExecutionEvidenceSchema = z.object({
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  result: z.enum(['reproduced', 'not_reproduced', 'inconclusive']),
  artifactDirectory: z.string().min(1),
  files: z.array(EvidenceReferenceSchema).max(500),
  evidenceRecords: z.array(EvidenceRecordSchema).max(500).default([]),
  telemetry: z.array(TelemetryEventSchema).max(1000),
  attempts: z.array(VerificationAttemptSchema).max(2).default([]),
  error: z.string().max(2000).nullable(),
}).strict()

export const RunProgressSchema = z.object({
  phase: z.enum(['queued', 'running_attempt', 'resetting', 'comparing', 'completed']),
  currentAttempt: z.union([z.literal(1), z.literal(2)]).nullable(),
  completedAttempts: z.number().int().min(0).max(2),
  completedActions: z.number().int().min(0).max(30),
  totalActions: z.number().int().min(0).max(30),
  message: z.string().max(300),
  // Postgres JSONB timestamps may use an explicit UTC offset (for example,
  // +00:00) while API-generated timestamps use the equivalent Z suffix.
  updatedAt: z.string().datetime({ offset: true }),
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
  progress: RunProgressSchema.nullable().default(null),
  execution: ExecutionEvidenceSchema.nullable().default(null),
}).strict()

export const RunWithPlanSchema = RunSchema.extend({ plan: AgentPlanSchema }).strict()

export type RunRecord = z.infer<typeof RunSchema>
export type RunStatus = z.infer<typeof RunStatusSchema>
export type RunWithPlan = z.infer<typeof RunWithPlanSchema>
