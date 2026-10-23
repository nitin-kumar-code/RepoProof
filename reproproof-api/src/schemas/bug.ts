import { z } from 'zod'

// Syntax validation only. The future browser executor must enforce approved
// hosts and block loopback/private destinations after DNS resolution.
const HttpUrlSchema = z.string().url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'URL must use http or https')

export const ReproductionStepSchema = z.object({
  order: z.number().int().positive(),
  instruction: z.string().trim().min(1).max(500),
}).strict()

const SubmittedStepSchema = z.object({
  order: z.number().int().positive(),
  // Blank text is structurally received and becomes a clarification request;
  // it must not cause other valid steps to be dropped.
  instruction: z.string().trim().max(500),
}).strict()

const OrderedStepsSchema = z.array(ReproductionStepSchema).min(1).max(30).superRefine((steps, context) => {
  steps.forEach((step, index) => {
    if (step.order !== index + 1) {
      context.addIssue({ code: 'custom', path: [index, 'order'], message: 'Step order must be sequential starting at 1' })
    }
  })
})

export const BugEnvironmentSchema = z.object({
  targetUrl: HttpUrlSchema.optional(),
  browser: z.literal('chromium').default('chromium'),
  appVersion: z.string().trim().min(1).max(100).optional(),
  operatingSystem: z.string().trim().min(1).max(100).optional(),
  // Identifies a controlled BugLab fixture. The API only accepts it when the
  // URL matches the operator-configured demo origin and scenario path.
  demoScenario: z.enum(['TC1', 'TC2', 'TC3', 'TC4']).optional(),
}).strict()

// Request shape intentionally allows missing reproduction details so the API can
// return a clarification request instead of fabricating a plan.
export const BugReportSubmissionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  steps: z.array(SubmittedStepSchema).max(30).optional(),
  expectedBehavior: z.string().trim().min(1).max(2000).optional(),
  actualBehavior: z.string().trim().min(1).max(2000).optional(),
  environment: BugEnvironmentSchema.default({ browser: 'chromium' }),
}).strict()

export const BugReportSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  steps: OrderedStepsSchema,
  expectedBehavior: z.string().trim().min(1).max(2000),
  actualBehavior: z.string().trim().min(1).max(2000),
  environment: BugEnvironmentSchema.extend({ targetUrl: HttpUrlSchema }),
  createdAt: z.string().datetime(),
}).strict()

export type ReproductionStep = z.infer<typeof ReproductionStepSchema>
export type BugEnvironment = z.infer<typeof BugEnvironmentSchema> & { targetUrl?: string }
export type BugReportSubmission = z.infer<typeof BugReportSubmissionSchema>
export type BugReport = z.infer<typeof BugReportSchema>
