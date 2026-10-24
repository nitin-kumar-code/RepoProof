import { z } from 'zod'

const HttpUrlSchema = z.string().url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'URL must use http or https')

// This is a data contract, not authorization to navigate. The executor must
// additionally enforce the approved target and block private network ranges.

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

const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: HttpUrlSchema }).strict(),
  z.object({ type: z.literal('click'), locator: LocatorSchema }).strict(),
  z.object({ type: z.literal('fill'), locator: LocatorSchema, value: z.string().max(5000) }).strict(),
  z.object({ type: z.literal('select'), locator: LocatorSchema, value: z.string().min(1).max(500) }).strict(),
  z.object({ type: z.literal('wait'), milliseconds: z.number().int().min(0).max(10000) }).strict(),
  z.object({ type: z.literal('screenshot'), label: z.string().trim().min(1).max(120) }).strict(),
  z.object({ type: z.literal('assert'), assertion: AssertionSchema }).strict(),
])

export const AgentPlanSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  preconditions: z.array(z.string().trim().min(1).max(500)).max(30),
  actions: z.array(ActionSchema).min(1).max(100),
  successCriteria: z.array(AssertionSchema).min(1).max(30),
}).strict()

export type AgentPlan = z.infer<typeof AgentPlanSchema>
export type PlanAction = z.infer<typeof ActionSchema>
export type PlanLocator = z.infer<typeof LocatorSchema>
export type PlanAssertion = z.infer<typeof AssertionSchema>
