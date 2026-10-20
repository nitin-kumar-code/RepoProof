import { mkdir, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Locator, Page } from 'playwright'
import { env } from '../config/env'
import { hashPlan } from './approvals'
import { validateTargetUrl } from './targetValidation'
import type { PlanAction, PlanLocator } from '../schemas/plan'
import type { VerificationAttemptSchema, EvidenceReferenceSchema, RunWithPlan } from '../schemas/run'
import { createBrowserRun } from '../browser/runner'
import { sanitizeError } from '../browser/telemetry'
import { z } from 'zod'
import { redactValue } from './redactor'
import { persistEvidenceFiles } from './evidenceStorage'
import { createFailureFingerprint } from '../browser/fingerprint'

type AttemptEvidence = z.infer<typeof VerificationAttemptSchema>
type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>
type RunResult = AttemptEvidence['result']
const maxActions = 30
const maxExecutionMs = 120_000
const maxStepMs = 10_000

class ExecutionBlockedError extends Error {}

function createHashForCriterion(criterion: string): string {
  return createHash('sha256').update(criterion.trim().toLocaleLowerCase()).digest('hex').slice(0, 24)
}

function telemetryMatchesCriterion(event: AttemptEvidence['telemetry'][number], criterion: string): boolean {
  const normalizedCriterion = criterion.toLocaleLowerCase()
  if (event.message?.toLocaleLowerCase().includes(normalizedCriterion)
    || event.failure?.toLocaleLowerCase().includes(normalizedCriterion)) return true
  if (event.status && new RegExp(`\\b${event.status}\\b`).test(normalizedCriterion) && event.url) {
    try {
      const eventPath = new URL(event.url).pathname
      const expectedPath = criterion.match(/\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+/)?.[0]
      const expectedMethod = criterion.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/i)?.[0]
      return (!expectedPath || expectedPath === eventPath)
        && (!expectedMethod || expectedMethod.toUpperCase() === event.method?.toUpperCase())
    } catch {
      return false
    }
  }
  return false
}

function resolveLocator(page: Page, descriptor: PlanLocator): Locator {
  switch (descriptor.kind) {
    case 'role': return page.getByRole(descriptor.role, { name: descriptor.name, exact: true })
    case 'label': return page.getByLabel(descriptor.text, { exact: true })
    case 'placeholder': return page.getByPlaceholder(descriptor.text, { exact: true })
    case 'text': return page.getByText(descriptor.text, { exact: true })
    case 'test_id': return page.getByTestId(descriptor.value)
    default: {
      const exhaustive: never = descriptor
      throw new ExecutionBlockedError(`Unsupported locator: ${String(exhaustive)}`)
    }
  }
}

async function uniqueLocator(page: Page, descriptor: PlanLocator): Promise<Locator> {
  const locator = resolveLocator(page, descriptor)
  await locator.first().waitFor({ state: 'attached', timeout: maxStepMs }).catch(() => undefined)
  const count = await locator.count()
  if (count !== 1) throw new ExecutionBlockedError(count === 0 ? 'Approved locator did not match an element' : 'Approved locator matched multiple elements')
  return locator
}

async function visibleTextMatch(page: Page, text: string, timeout = maxStepMs): Promise<boolean> {
  const matches = page.getByText(text, { exact: false })
  await matches.first().waitFor({ state: 'visible', timeout }).catch(() => undefined)
  return (await matches.count()) > 0 && await matches.first().isVisible()
}

function slug(value: string): string {
  const result = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return result || 'evidence'
}

function recordFile(files: EvidenceReference[], kind: EvidenceReference['kind'], file: string, actionNumber: number | null): void {
  files.push({ kind, file, actionNumber, timestamp: new Date().toISOString() })
}

async function screenshot(page: Page, directory: string, files: EvidenceReference[], actionNumber: number | null, label: string): Promise<void> {
  const filename = `${actionNumber === null ? 'checkpoint' : `step-${actionNumber}`}-${slug(label)}.png`
  const file = path.join(directory, 'screenshots', filename)
  await page.screenshot({
    path: file,
    fullPage: false,
    animations: 'disabled',
    mask: [
      page.locator('input[type="password"]'),
      page.locator('[data-sensitive="true"]'),
      page.locator('input[autocomplete^="cc-"]'),
    ],
    maskColor: '#1e293b',
    timeout: maxStepMs,
  })
  recordFile(files, 'screenshot', path.relative(directory, file), actionNumber)
}

async function executeAction(page: Page, action: PlanAction, targetOrigin: string, failureCriteria: string[], failureObserved: { value: boolean; checked: boolean; description: string | null }): Promise<void> {
  switch (action.type) {
    case 'navigate': {
      const destination = await validateTargetUrl(action.url)
      if (destination.origin !== targetOrigin) throw new ExecutionBlockedError('Navigation destination differs from the approved target origin')
      await page.goto(destination.href, { waitUntil: 'domcontentloaded', timeout: maxStepMs })
      return
    }
    case 'click': {
      const locator = await uniqueLocator(page, action.locator)
      await locator.click({ timeout: maxStepMs })
      return
    }
    case 'fill': {
      const locator = await uniqueLocator(page, action.locator)
      await locator.fill(action.value, { timeout: maxStepMs })
      return
    }
    case 'select': {
      const locator = await uniqueLocator(page, action.locator)
      await locator.selectOption(action.value, { timeout: maxStepMs })
      return
    }
    case 'wait':
      await page.waitForTimeout(Math.min(action.milliseconds, maxStepMs))
      return
    case 'screenshot':
      return
    case 'assert': {
      const assertion = action.assertion
      if (assertion.type === 'expected_failure_observed') {
        if (!failureCriteria.includes(assertion.description)) {
          throw new ExecutionBlockedError('Failure assertion is not an exact reported failure criterion')
        }
        failureObserved.checked = true
        failureObserved.value = await visibleTextMatch(page, assertion.description)
        if (failureObserved.value) failureObserved.description = assertion.description
        return
      }
      if (assertion.type === 'url') {
        const expected = await validateTargetUrl(assertion.expected)
        if (page.url() !== expected.href) throw new ExecutionBlockedError('Approved URL assertion did not match')
        return
      }
      const locator = await uniqueLocator(page, assertion.locator)
      if (assertion.type === 'visible') {
        if (!(await locator.isVisible())) throw new ExecutionBlockedError('Approved visibility assertion did not match')
        return
      }
      if (!(await locator.getByText(assertion.expected, { exact: false }).count()) && !(await locator.innerText()).includes(assertion.expected)) {
        throw new ExecutionBlockedError('Approved text assertion did not match')
      }
      return
    }
    default: {
      const exhaustive: never = action
      throw new ExecutionBlockedError(`Unsupported action: ${String(exhaustive)}`)
    }
  }
}

function approvedTarget(run: RunWithPlan): URL {
  const value = run.plan.preconditions.find(item => item.startsWith('Approved target: '))?.slice('Approved target: '.length)
  if (!value) throw new ExecutionBlockedError('Approved plan has no target URL')
  return new URL(value)
}

export async function executeApprovedPlan(
  run: RunWithPlan,
  attemptNumber = 1,
  onActionCompleted?: (completed: number) => Promise<void>,
): Promise<AttemptEvidence> {
  const startedAt = new Date().toISOString()
  const safeRunId = run.id.replace(/[^a-z0-9-]/gi, '_')
  const artifactRoot = path.resolve(env.RUN_ARTIFACTS_DIR)
  const runRoot = path.join(artifactRoot, safeRunId)
  const runDirectory = path.join(runRoot, `attempt-${attemptNumber}`)
  const files: EvidenceReference[] = []
  const evidenceRecords: AttemptEvidence['evidenceRecords'] = []
  let browserRun: Awaited<ReturnType<typeof createBrowserRun>> | undefined
  let result: RunResult = 'inconclusive'
  let errorMessage: string | null = null
  let failureObserved = { value: false, checked: false, description: null as string | null }
  let currentActionNumber: number | null = null
  let completed = false
  let expectedFailureFound = false
  let fingerprint: AttemptEvidence['fingerprint'] = null
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    if (run.status !== 'running' || run.approval?.decision !== 'approved'
      || run.approval.planHash !== run.planHash || hashPlan(run.plan) !== run.planHash) {
      throw new ExecutionBlockedError('Plan is not the exact approved version')
    }
    if (run.plan.steps.length > maxActions) throw new ExecutionBlockedError('Plan exceeds the action limit')
    if (run.plan.steps.some((step, index, steps) => index > 0 && step.stepOrder <= steps[index - 1].stepOrder)) {
      throw new ExecutionBlockedError('Plan steps are not in strict order')
    }
    const target = await validateTargetUrl(approvedTarget(run).href)
    await mkdir(runDirectory, { recursive: true, mode: 0o700 })
    browserRun = await createBrowserRun(runDirectory)
    const timedExecution = async () => {
      await screenshot(browserRun!.page, runDirectory, files, null, 'initial')
      if (run.plan.clarifications.length || run.plan.steps.some(step => step.action === null || step.clarification !== null)) {
        throw new ExecutionBlockedError('Plan contains a clarification-only step')
      }
      let completedActions = 0
      for (const step of run.plan.steps) {
        if (!step.action) throw new ExecutionBlockedError('Plan contains a clarification-only step')
        currentActionNumber = step.stepOrder
        await executeAction(browserRun!.page, step.action, target.origin, run.plan.failureCriteria, failureObserved)
        if (step.action.type === 'screenshot') {
          await screenshot(browserRun!.page, runDirectory, files, step.stepOrder, step.action.label)
        }
        completedActions += 1
        await onActionCompleted?.(completedActions)
      }
      await screenshot(browserRun!.page, runDirectory, files, run.plan.steps.at(-1)?.stepOrder ?? null, 'final')
    }
    const totalTimer = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        void browserRun?.close().finally(() => reject(new ExecutionBlockedError('Run time limit exceeded')))
      }, maxExecutionMs)
      timeout.unref?.()
    })
    await Promise.race([timedExecution(), totalTimer])
    completed = true
    let matchedCriterion = failureObserved.value ? failureObserved.description : null
    if (!matchedCriterion) {
      for (const criterion of run.plan.failureCriteria) {
        if (await visibleTextMatch(browserRun.page, criterion, Math.min(maxStepMs, 1500))) {
          matchedCriterion = criterion
          break
        }
      }
    }
    let matchedEvent = null as (typeof browserRun.telemetry.events)[number] | null
    if (!matchedCriterion) {
      for (const criterion of run.plan.failureCriteria) {
        matchedEvent = browserRun.telemetry.events.find(event => telemetryMatchesCriterion(event, criterion)) ?? null
        if (matchedEvent) {
          matchedCriterion = criterion
          break
        }
      }
    }
    expectedFailureFound = matchedCriterion !== null
    if (matchedCriterion) {
      const route = new URL(browserRun.page.url()).pathname
      const type = matchedEvent?.type ?? 'visible_text'
      let request: { method: string; path: string; status: number | null } | null = null
      if (matchedEvent?.url) {
        try {
          request = { method: matchedEvent.method ?? 'GET', path: new URL(matchedEvent.url).pathname, status: matchedEvent.status ?? null }
        } catch {
          request = null
        }
      }
      fingerprint = createFailureFingerprint({
        route,
        criterionId: createHashForCriterion(matchedCriterion),
        failureType: type,
        message: matchedEvent?.message ?? matchedCriterion,
        request,
      })
    }
    result = expectedFailureFound ? 'reproduced' : 'not_reproduced'
  } catch (cause) {
    errorMessage = sanitizeError(cause)
    result = 'inconclusive'
    completed = false
    if (browserRun) {
      try {
        await screenshot(browserRun.page, runDirectory, files, currentActionNumber, 'failure')
      } catch {
        // Preserve the original execution error if page capture is unavailable.
      }
    }
  } finally {
    if (timeout) clearTimeout(timeout)
  }

  let recordingPath: string | undefined
  if (browserRun) {
    try {
      recordingPath = await browserRun.close()
    } catch (cause) {
      errorMessage ??= sanitizeError(cause)
      result = 'inconclusive'
      completed = false
    }
  }
  if (recordingPath) recordFile(files, 'recording', path.relative(runDirectory, recordingPath), null)

  const telemetry = redactValue(browserRun?.telemetry.events ?? [])
  try {
    await mkdir(runDirectory, { recursive: true, mode: 0o700 })
    const consoleEvents = telemetry.filter(event => event.type === 'console_error' || event.type === 'page_error')
    const networkEvents = telemetry.filter(event => event.type === 'request_failed' || event.type === 'http_failure')
    const createdAt = new Date().toISOString()
    const addRecord = (type: AttemptEvidence['evidenceRecords'][number]['type'], relativePath: string) => {
      evidenceRecords.push({ id: randomUUID(), runId: run.id, attemptNumber, type, storageKey: `${safeRunId}/attempt-${attemptNumber}/${relativePath}`, createdAt, sanitized: type !== 'video' })
    }
    await writeFile(path.join(runDirectory, 'console.json'), JSON.stringify(consoleEvents, null, 2), { mode: 0o600 })
    addRecord('console', 'console.json')
    await writeFile(path.join(runDirectory, 'network.json'), JSON.stringify(networkEvents, null, 2), { mode: 0o600 })
    addRecord('network', 'network.json')
    for (const file of files) {
      addRecord(file.kind === 'screenshot' ? 'screenshot' : 'video', file.file)
    }
    addRecord('report', 'report.json')
    const report = redactValue({ runId: run.id, attemptNumber, result, completed, expectedFailureFound, fingerprint, startedAt, completedAt: new Date().toISOString(), error: errorMessage, telemetryCounts: { console: consoleEvents.length, network: networkEvents.length }, evidenceRecords })
    await writeFile(path.join(runDirectory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
    await persistEvidenceFiles(runRoot, evidenceRecords)
  } catch (cause) {
    errorMessage ??= `Could not save evidence bundle: ${sanitizeError(cause)}`
    result = 'inconclusive'
    completed = false
    evidenceRecords.length = 0
  }

  return {
    attemptNumber,
    startedAt,
    completedAt: new Date().toISOString(),
    completed,
    expectedFailureFound,
    fingerprint,
    result,
    artifactDirectory: path.relative(process.cwd(), runDirectory) || runDirectory,
    files,
    evidenceRecords,
    telemetry,
    error: errorMessage ? redactValue(errorMessage) : null,
  }
}
