import { z } from 'zod'

// PostgreSQL/Supabase timestamps may serialize with an explicit +00:00 offset.
const isoDate = z.string().datetime({ offset: true })
const stepSchema = z.object({ order: z.number().int().positive(), instruction: z.string().min(1) }).strict()
const environmentSchema = z.object({ targetUrl: z.string().url(), browser: z.literal('chromium'), appVersion: z.string().optional(), operatingSystem: z.string().optional(), demoScenario: z.enum(['TC1', 'TC2', 'TC3', 'TC4']).optional() }).strict()
export const bugReportSchema = z.object({
  id: z.string().min(1), title: z.string(), description: z.string(), steps: z.array(stepSchema),
  expectedBehavior: z.string(), actualBehavior: z.string(), environment: environmentSchema, createdAt: isoDate,
}).strict()
const locatorSchema = z.union([
  z.object({ kind: z.literal('role'), role: z.enum(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'option', 'heading', 'img', 'dialog', 'alert', 'tab', 'tabpanel', 'menuitem', 'switch', 'searchbox', 'gridcell']), name: z.string() }).strict(),
  z.object({ kind: z.enum(['label', 'placeholder', 'text']), text: z.string() }).strict(),
  z.object({ kind: z.literal('test_id'), value: z.string() }).strict(),
])
const assertionSchema = z.union([
  z.object({ type: z.literal('visible'), locator: locatorSchema }).strict(),
  z.object({ type: z.literal('text'), locator: locatorSchema, expected: z.string() }).strict(),
  z.object({ type: z.literal('url'), expected: z.string().url() }).strict(),
  z.object({ type: z.literal('expected_failure_observed'), description: z.string() }).strict(),
])
export const planActionSchema = z.union([
  z.object({ type: z.literal('navigate'), url: z.string().url() }).strict(),
  z.object({ type: z.literal('click'), locator: locatorSchema }).strict(),
  z.object({ type: z.literal('fill'), locator: locatorSchema, value: z.string() }).strict(),
  z.object({ type: z.literal('select'), locator: locatorSchema, value: z.string() }).strict(),
  z.object({ type: z.literal('wait'), milliseconds: z.number().int().min(0).max(10000) }).strict(),
  z.object({ type: z.literal('screenshot'), label: z.string() }).strict(),
  z.object({ type: z.literal('assert'), assertion: assertionSchema }).strict(),
])
const plannedStepSchema = z.object({ stepOrder: z.number().int().positive(), instruction: z.string(), action: planActionSchema.nullable(), rationale: z.string(), clarification: z.string().nullable() }).strict()
export const agentPlanSchema = z.object({
  summary: z.string(), verificationMode: z.enum(['read_only', 'reset_required', 'reset']), preconditions: z.array(z.string()),
  clarifications: z.array(z.string()), steps: z.array(plannedStepSchema), successCriteria: z.array(z.string()), failureCriteria: z.array(z.string()),
}).strict()
const evidenceRecordSchema = z.object({
  id: z.string(), runId: z.string(), attemptNumber: z.number().int().positive(), type: z.enum(['video', 'screenshot', 'console', 'network', 'report']),
  storageKey: z.string(), createdAt: isoDate, sanitized: z.boolean(),
}).strict()
const telemetrySchema = z.object({
  type: z.enum(['console_error', 'page_error', 'request', 'response', 'request_failed', 'http_failure']), timestamp: isoDate,
  message: z.string().optional(), severity: z.string().optional(), method: z.string().optional(), url: z.string().optional(), status: z.number().optional(), failure: z.string().optional(),
}).strict()
const fingerprintSchema = z.object({ hash: z.string(), route: z.string(), criterionId: z.string(), failureType: z.enum(['visible_text', 'console_error', 'page_error', 'request_failed', 'http_failure']), message: z.string(), request: z.object({ method: z.string(), path: z.string(), status: z.number().nullable() }).strict().nullable() }).strict()
const attemptSchema = z.object({
  attemptNumber: z.number().int().positive(), startedAt: isoDate, completedAt: isoDate, completed: z.boolean(), expectedFailureFound: z.boolean(),
  fingerprint: fingerprintSchema.nullable(), result: z.enum(['reproduced', 'not_reproduced', 'inconclusive']), artifactDirectory: z.string(),
  files: z.array(z.object({ kind: z.enum(['screenshot', 'recording', 'telemetry']), file: z.string(), actionNumber: z.number().int().positive().nullable(), timestamp: isoDate })),
  evidenceRecords: z.array(evidenceRecordSchema), telemetry: z.array(telemetrySchema), error: z.string().nullable(),
}).strict()
const executionSchema = z.object({
  startedAt: isoDate, completedAt: isoDate, result: z.enum(['reproduced', 'not_reproduced', 'inconclusive']), artifactDirectory: z.string(),
  files: z.array(z.object({ kind: z.enum(['screenshot', 'recording', 'telemetry']), file: z.string(), actionNumber: z.number().int().positive().nullable(), timestamp: isoDate })),
  evidenceRecords: z.array(evidenceRecordSchema), telemetry: z.array(telemetrySchema), attempts: z.array(attemptSchema), error: z.string().nullable(),
}).strict()
export const runSchema = z.object({
  id: z.string().min(1), bugReportId: z.string().min(1), status: z.enum(['pending', 'awaiting_approval', 'approved', 'cancelled', 'expired', 'running', 'verifying', 'reproduced', 'not_reproduced', 'inconclusive', 'failed', 'passed', 'error']),
  browser: z.literal('chromium'), createdAt: isoDate, updatedAt: isoDate, planHash: z.string(), approvalExpiresAt: isoDate,
  approval: z.object({ approver: z.string(), decision: z.enum(['approved', 'rejected']), decidedAt: isoDate, planHash: z.string() }).nullable(),
  progress: z.object({ phase: z.enum(['queued', 'running_attempt', 'resetting', 'comparing', 'completed']), currentAttempt: z.union([z.literal(1), z.literal(2)]).nullable(), completedAttempts: z.number(), completedActions: z.number(), totalActions: z.number(), message: z.string(), updatedAt: isoDate }).nullable().default(null),
  execution: executionSchema.nullable().default(null), plan: agentPlanSchema,
}).strict()
const downloadUrlSchema = z.string().refine(value => {
  if (value.startsWith('/api/')) return true
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}, 'Evidence download URL must use the API or HTTP(S)')
export const evidenceResponseSchema = z.object({ runId: z.string(), files: z.array(evidenceRecordSchema.extend({ downloadUrl: downloadUrlSchema.nullable(), restricted: z.boolean() })) })
export const bugCreateResultSchema = z.union([
  z.object({ status: z.literal('clarification_required'), complete: z.literal(false), clarificationRequests: z.array(z.object({ field: z.string(), question: z.string() })) }),
  z.object({ id: z.string(), status: z.literal('created'), complete: z.literal(true), bugReport: bugReportSchema }),
])

export type ParsedBugReport = z.infer<typeof bugReportSchema>
export type ParsedRun = z.infer<typeof runSchema>
export type ParsedEvidenceResponse = z.infer<typeof evidenceResponseSchema>
