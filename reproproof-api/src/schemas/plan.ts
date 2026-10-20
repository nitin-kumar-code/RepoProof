import { z } from 'zod'

const HttpUrlSchema = z.string().url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'URL must use http or https')

// Plans are review data. The executor must independently enforce destination
// policy and must not execute a plan until a user approves it.
const LocatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('role'), role: z.enum(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'option', 'heading', 'img', 'dialog', 'alert', 'tab', 'tabpanel', 'menuitem', 'switch', 'searchbox', 'gridcell']), name: z.string().trim().min(1).max(200) }).strict(),
  z.object({ kind: z.literal('label'), text: z.string().trim().min(1).max(200) }).strict(),
  z.object({ kind: z.literal('placeholder'), text: z.string().trim().min(1).max(200) }).strict(),
  z.object({ kind: z.literal('text'), text: z.string().trim().min(1).max(200) }).strict(),
  z.object({ kind: z.literal('test_id'), value: z.string().trim().min(1).max(200) }).strict(),
])

const AssertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visible'), locator: LocatorSchema }).strict(),
  z.object({ type: z.literal('text'), locator: LocatorSchema, expected: z.string().min(1).max(1000) }).strict(),
  z.object({ type: z.literal('url'), expected: HttpUrlSchema }).strict(),
  z.object({ type: z.literal('expected_failure_observed'), description: z.string().trim().min(1).max(1000) }).strict(),
])

const ExecutableActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: HttpUrlSchema }).strict(),
  z.object({ type: z.literal('click'), locator: LocatorSchema }).strict(),
  z.object({ type: z.literal('fill'), locator: LocatorSchema, value: z.string().max(5000) }).strict(),
  z.object({ type: z.literal('select'), locator: LocatorSchema, value: z.string().min(1).max(500) }).strict(),
  z.object({ type: z.literal('wait'), milliseconds: z.number().int().min(0).max(10000) }).strict(),
  z.object({ type: z.literal('screenshot'), label: z.string().trim().min(1).max(120) }).strict(),
  z.object({ type: z.literal('assert'), assertion: AssertionSchema }).strict(),
])

export const PlannedStepSchema = z.object({
  stepOrder: z.number().int().positive(),
  instruction: z.string().trim().min(1).max(500),
  action: ExecutableActionSchema.nullable(),
  rationale: z.string().trim().min(1).max(1000),
  clarification: z.string().trim().min(1).max(1000).nullable(),
}).strict()

export const AgentPlanSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  verificationMode: z.enum(['read_only', 'reset_required', 'reset']).default('read_only'),
  preconditions: z.array(z.string().trim().min(1).max(500)).max(30),
  clarifications: z.array(z.string().trim().min(1).max(1000)).max(30),
  steps: z.array(PlannedStepSchema).min(1).max(30),
  successCriteria: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  failureCriteria: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
}).strict()

// Model-generated fields only. Preconditions and behavior criteria are
// copied from the report in code so the model cannot paraphrase them.
export const PlannerDraftSchema = AgentPlanSchema.pick({ summary: true, clarifications: true, steps: true })

export type AgentPlan = z.infer<typeof AgentPlanSchema>
export type PlannerDraft = z.infer<typeof PlannerDraftSchema>
export type PlannedStep = z.infer<typeof PlannedStepSchema>
export type PlanAction = z.infer<typeof ExecutableActionSchema>
export type PlanLocator = z.infer<typeof LocatorSchema>
export type PlanAssertion = z.infer<typeof AssertionSchema>
