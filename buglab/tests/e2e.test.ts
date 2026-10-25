import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createServer, type Server } from 'node:http'
import { chromium, type Browser, type Page } from '@playwright/test'
import { createServer as createViteServer, type ViteDevServer } from 'vite'
import { createBugLabApp } from '../server/routes.js'
import { BugLabStore, seededRecords } from '../server/fixtures.js'
import { product } from '../shared/data.js'
import { redactText } from '../server/redaction.js'

let apiServer: Server
let vite: ViteDevServer
let browser: Browser
let baseUrl: string
let store: BugLabStore
const evidenceRoot = path.join(tmpdir(), 'buglab-evidence', `acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const testApprover = { username: 'judge', password: 'buglab-test-approval-secret' }
const testApproverHeader = `Basic ${Buffer.from(`${testApprover.username}:${testApprover.password}`).toString('base64')}`

async function prepareEvidence(caseName: string): Promise<string> {
  const directory = path.join(evidenceRoot, caseName)
  await mkdir(directory, { recursive: true })
  return directory
}

function observePage(page: Page) {
  const events: Array<Record<string, unknown>> = []
  page.on('console', message => {
    if (message.type() === 'error') events.push({ kind: 'console_error', message: redactText(message.text()) })
  })
  page.on('pageerror', error => events.push({ kind: 'page_error', message: redactText(error.message) }))
  page.on('request', request => events.push({ kind: 'request', method: request.method(), path: new URL(request.url()).pathname }))
  page.on('response', response => events.push({ kind: 'response', method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() }))
  page.on('requestfailed', request => events.push({ kind: 'request_failed', method: request.method(), path: new URL(request.url()).pathname, reason: redactText(request.failure()?.errorText ?? 'unknown') }))
  return events
}

async function saveScreenshot(page: Page, file: string): Promise<void> {
  const sensitive = page.locator('[data-sensitive="true"]')
  await page.screenshot({ path: file, fullPage: true, mask: await sensitive.count() ? [sensitive] : [], maskColor: '#173d33' })
}

before(async () => {
  const apiApp: { current?: ReturnType<typeof createBugLabApp> } = {}
  apiServer = createServer((request, response) => {
    if (!apiApp.current) {
      response.statusCode = 503
      response.end('BugLab API is starting')
      return
    }
    apiApp.current(request, response)
  })
  await new Promise<void>((resolve, reject) => {
    apiServer.once('error', reject)
    apiServer.listen(0, '127.0.0.1', resolve)
  })
  const apiAddress = apiServer.address()
  assert.ok(apiAddress && typeof apiAddress !== 'string')
  vite = await createViteServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      proxy: { '/api': `http://127.0.0.1:${apiAddress.port}` },
    },
  })
  await vite.listen()
  const httpServer = vite.httpServer
  assert.ok(httpServer)
  const address = httpServer.address()
  assert.ok(address && typeof address !== 'string')
  baseUrl = `http://127.0.0.1:${address.port}`
  store = new BugLabStore()
  apiApp.current = createBugLabApp(store, Date.now, {
    allowedUiOrigins: [baseUrl],
    approvalUsername: testApprover.username,
    approvalPassword: testApprover.password,
  })
  browser = await chromium.launch({ headless: true })
})

after(async () => {
  await browser?.close()
  await vite?.close()
  if (apiServer?.listening) await new Promise<void>((resolve, reject) => apiServer.close(error => error ? reject(error) : resolve()))
})

async function apiPost(pathname: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl, 'Sec-Fetch-Site': 'same-origin', Authorization: testApproverHeader }, body: JSON.stringify(body) })
}

async function reset(): Promise<void> {
  const response = await apiPost('/sandbox/ui-reset', {})
  assert.equal(response.status, 200)
}

test('TC1 repeats the same cart defect in two fresh browser contexts', async () => {
  const evidenceDir = await prepareEvidence('TC1')
  const attempts: Array<Record<string, unknown>> = []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptDir = path.join(evidenceDir, `attempt-${attempt + 1}`)
    const videoDir = path.join(attemptDir, 'video')
    await mkdir(videoDir, { recursive: true })
    await reset()
    const context = await browser.newContext({ recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } } })
    const page = await context.newPage()
    const events = observePage(page)
    await page.goto(baseUrl)
    await page.getByTestId('add-to-cart').click()
    const consoleEvent = page.waitForEvent('console', { predicate: message => message.type() === 'error' && message.text().includes("Cart subtotal omits the second item's price.") })
    await page.getByTestId('add-to-cart').click()
    await consoleEvent
    await page.goto(`${baseUrl}/cart`)
    await page.getByTestId('tc1-failure').waitFor({ state: 'visible' })
    const cart = await (await fetch(`${baseUrl}/api/cart`)).json() as { fingerprint: string; subtotalCents: number; expectedSubtotalCents: number }
    const screenshot = path.join(attemptDir, 'cart.png')
    await saveScreenshot(page, screenshot)
    assert.equal(await page.getByTestId('cart-quantity-value').innerText(), 'Qty 2')
    const video = page.video()
    await context.close()
    const videoPath = await video?.path()
    assert.ok(videoPath && (await stat(videoPath)).size > 0, 'TC1 must save private recording evidence for the synthetic reproduction')
    attempts.push({ attempt: attempt + 1, resetBeforeAttempt: true, cleanBrowserContext: true, quantity: 2, subtotalCents: cart.subtotalCents, expectedSubtotalCents: cart.expectedSubtotalCents, fingerprint: cart.fingerprint, consoleErrors: consoleObservationsFor(events), events, screenshot, video: videoPath ?? null })
  }
  const first = attempts[0] as { fingerprint: string; subtotalCents: number; expectedSubtotalCents: number; consoleErrors: string[] }
  const second = attempts[1] as { fingerprint: string; subtotalCents: number; expectedSubtotalCents: number; consoleErrors: string[] }
  assert.equal(first.subtotalCents, 6400)
  assert.equal(first.expectedSubtotalCents, 12800)
  assert.equal(second.subtotalCents, 6400)
  assert.equal(second.expectedSubtotalCents, 12800)
  assert.equal(first.fingerprint, second.fingerprint)
  assert.deepEqual(first.consoleErrors, second.consoleErrors)
  await writeFile(path.join(evidenceDir, 'verification-report.json'), JSON.stringify({ scenario: 'TC1', verdict: 'reproduced', videoPolicy: 'TC1 synthetic-only; local and restricted; unsanitized; not shareable', fingerprintComparableFields: ['quantity', 'subtotalCents', 'expectedSubtotalCents', 'fingerprint'], ignoredVolatileFields: ['timestamps', 'random IDs'], attempts }, null, 2))
})

function consoleObservationsFor(events: Array<Record<string, unknown>>): string[] {
  return events.filter(event => event.kind === 'console_error').map(event => String(event.message))
}

test('TC2 completes a clean single-item scenario without the reported failure', async () => {
  const evidenceDir = await prepareEvidence('TC2')
  await reset()
  const context = await browser.newContext()
  const page = await context.newPage()
  const events = observePage(page)
  await page.goto(baseUrl)
  await page.getByTestId('add-to-cart').click()
  await page.goto(`${baseUrl}/cart`)
  assert.equal(await page.getByTestId('cart-subtotal').innerText(), '$64.00')
  assert.equal(await page.getByTestId('tc1-failure').count(), 0)
  const cart = await (await fetch(`${baseUrl}/api/cart`)).json() as { quantity: number; tc1Failure: boolean; subtotalCents: number; expectedSubtotalCents: number }
  assert.equal(cart.tc1Failure, false)
  assert.equal(cart.subtotalCents, cart.expectedSubtotalCents)
  const reportedFailureObserved = cart.subtotalCents === 0
  const verdict = !reportedFailureObserved && cart.subtotalCents === cart.expectedSubtotalCents && cart.quantity === 1 ? 'not_reproduced' : 'inconclusive'
  assert.equal(verdict, 'not_reproduced')
  const screenshot = path.join(evidenceDir, 'single-item-cart.png')
  await saveScreenshot(page, screenshot)
  await context.close()
  await writeFile(path.join(evidenceDir, 'verification-report.json'), JSON.stringify({ scenario: 'TC2', verdict, claim: 'The reported zero-subtotal behavior was absent in this completed attempt; this does not claim the bug was fixed.', observed: { quantity: cart.quantity, subtotalCents: cart.subtotalCents, expectedSubtotalCents: cart.expectedSubtotalCents, reportedFailureObserved }, events, screenshot, video: null }, null, 2))
})

test('TC3 requires scoped approval in the UI and only deletes the approved synthetic fixture', async () => {
  const evidenceDir = await prepareEvidence('TC3')
  await reset()
  const state = await (await fetch(`${baseUrl}/api/sandbox/records`)).json() as { stateVersion: number }
  const ids = ['sandbox-order-001']
  const noApproval = await apiPost('/sandbox/records/delete', { approvalId: '00000000-0000-4000-8000-000000000000', action: 'delete_records', recordIds: ids, planVersion: state.stateVersion, planHash: '0'.repeat(64) })
  assert.equal(noApproval.status, 403)
  const directApiWithoutBrowserOrigin = await fetch(`${baseUrl}/api/sandbox/records/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: testApproverHeader }, body: JSON.stringify({ approvalId: '00000000-0000-4000-8000-000000000000', action: 'delete_records', recordIds: ids, planVersion: state.stateVersion, planHash: '0'.repeat(64) }) })
  assert.equal(directApiWithoutBrowserOrigin.status, 403)
  const unseededTarget = await apiPost('/sandbox/deletion-approvals', { recordIds: ['sandbox-order-999'], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: state.stateVersion })
  assert.equal(unseededTarget.status, 409)
  const approvalResponse = await apiPost('/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: state.stateVersion })
  const approval = await approvalResponse.json() as { approvalId: string; action: 'delete_records'; recordIds: string[]; planVersion: number; planHash: string }
  assert.equal(approvalResponse.status, 201)
  const actionTamper = await apiPost('/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: state.stateVersion, action: 'delete-all' })
  assert.equal(actionTamper.status, 400)
  const targetTamper = await apiPost('/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: state.stateVersion, targetUrl: 'https://other.example/' })
  assert.equal(targetTamper.status, 400)
  const executeActionTamper = await apiPost('/sandbox/records/delete', { approvalId: approval.approvalId, recordIds: ids, action: 'delete-all', planVersion: approval.planVersion, planHash: approval.planHash })
  assert.equal(executeActionTamper.status, 400)
  const executeTargetTamper = await apiPost('/sandbox/records/delete', { approvalId: approval.approvalId, recordIds: ids, action: approval.action, planVersion: approval.planVersion, planHash: approval.planHash, targetUrl: 'https://other.example/' })
  assert.equal(executeTargetTamper.status, 400)
  const otherApprovalResponse = await apiPost('/sandbox/deletion-approvals', { recordIds: ['sandbox-customer-001'], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: state.stateVersion })
  const otherApproval = await otherApprovalResponse.json() as { approvalId: string; action: 'delete_records'; planVersion: number; planHash: string }
  const deleteOther = await apiPost('/sandbox/records/delete', { approvalId: otherApproval.approvalId, action: otherApproval.action, recordIds: ['sandbox-customer-001'], planVersion: otherApproval.planVersion, planHash: otherApproval.planHash })
  assert.equal(deleteOther.status, 200)
  const staleApproval = await apiPost('/sandbox/records/delete', { approvalId: approval.approvalId, action: approval.action, recordIds: ids, planVersion: approval.planVersion, planHash: approval.planHash })
  assert.equal(staleApproval.status, 403)
  assert.equal(((await (await fetch(`${baseUrl}/api/sandbox/records`)).json()) as { records: unknown[] }).records.length, 2)

  // A target snapshot changed out-of-band must invalidate the plan even if its
  // ID and caller-supplied plan hash are unchanged.
  await reset()
  const targetState = await (await fetch(`${baseUrl}/api/sandbox/records`)).json() as { stateVersion: number }
  const targetApprovalResponse = await apiPost('/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: targetState.stateVersion })
  const targetApproval = await targetApprovalResponse.json() as { approvalId: string; action: 'delete_records'; planVersion: number; planHash: string }
  store.records[0].name = 'Modified synthetic record'
  const changedTarget = await apiPost('/sandbox/records/delete', { approvalId: targetApproval.approvalId, action: targetApproval.action, recordIds: ids, planVersion: targetApproval.planVersion, planHash: targetApproval.planHash })
  assert.equal(changedTarget.status, 409)
  assert.equal(store.records.length, 3)

  // Reset both restores exactly the documented synthetic seed and invalidates
  // outstanding approvals bound to the prior version.
  await reset()
  const resetState = await (await fetch(`${baseUrl}/api/sandbox/records`)).json() as { stateVersion: number; records: Array<{ id: string }> }
  assert.deepEqual(resetState.records, seededRecords())
  const beforeResetApprovalResponse = await apiPost('/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: resetState.stateVersion })
  const beforeResetApproval = await beforeResetApprovalResponse.json() as { approvalId: string; action: 'delete_records'; planVersion: number; planHash: string }
  await reset()
  const resetReplay = await apiPost('/sandbox/records/delete', { approvalId: beforeResetApproval.approvalId, action: beforeResetApproval.action, recordIds: ids, planVersion: beforeResetApproval.planVersion, planHash: beforeResetApproval.planHash })
  assert.equal(resetReplay.status, 403)

  // Two simultaneous submissions using one approval can cause only one delete.
  const raceState = await (await fetch(`${baseUrl}/api/sandbox/records`)).json() as { stateVersion: number }
  const raceApprovalResponse = await apiPost('/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: raceState.stateVersion })
  const raceApproval = await raceApprovalResponse.json() as { approvalId: string; action: 'delete_records'; planVersion: number; planHash: string }
  const racePayload = { approvalId: raceApproval.approvalId, action: raceApproval.action, recordIds: ids, planVersion: raceApproval.planVersion, planHash: raceApproval.planHash }
  const duplicateResults = await Promise.all([apiPost('/sandbox/records/delete', racePayload), apiPost('/sandbox/records/delete', racePayload)])
  assert.deepEqual(duplicateResults.map(result => result.status).sort(), [200, 403])
  const replay = await apiPost('/sandbox/records/delete', racePayload)
  assert.equal(replay.status, 403)
  await reset()
  const restoredAfterChecks = await (await fetch(`${baseUrl}/api/sandbox/records`)).json() as { records: Array<{ id: string }> }
  assert.deepEqual(restoredAfterChecks.records, seededRecords())

  // Exercise the same scoped delete path through the human-facing UI.
  await reset()
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/sandbox`)
  const row = page.getByTestId('sandbox-record').filter({ hasText: 'sandbox-order-001' })
  await row.getByRole('checkbox').check()
  await page.getByTestId('attempt-unapproved-delete').click()
  await page.getByText('The server rejects an unapproved direct deletion request and the seed record remains.').waitFor()
  assert.equal(((await (await fetch(`${baseUrl}/api/sandbox/records`)).json()) as { records: unknown[] }).records.length, 3)
  await page.getByTestId('delete-record').click()
  await assert.doesNotReject(() => page.getByTestId('delete-confirmation').waitFor())
  await page.getByTestId('delete-approver').fill(testApprover.username)
  await page.getByTestId('delete-approver-password').fill(testApprover.password)
  await page.getByTestId('delete-approval-phrase').fill('DELETE 1 SANDBOX RECORD')
  await page.getByTestId('approve-deletion').click()
  await page.getByTestId('delete-approved-records').click()
  await page.getByText('Deleted 1 approved disposable record(s).').waitFor()
  const remaining = await (await fetch(`${baseUrl}/api/sandbox/records`)).json() as { records: Array<{ id: string }> }
  assert.deepEqual(remaining.records.map(record => record.id), ['sandbox-customer-001', 'sandbox-cart-001'])
  await reset()
  const restored = await (await fetch(`${baseUrl}/api/sandbox/records`)).json() as { records: Array<{ id: string }> }
  assert.deepEqual(restored.records.map(record => record.id), ['sandbox-order-001', 'sandbox-customer-001', 'sandbox-cart-001'])
  await writeFile(path.join(evidenceDir, 'verification-report.json'), JSON.stringify({ scenario: 'TC3', verdict: 'pass', checks: { directDeleteWithoutApproval: noApproval.status, directApiWithoutBrowserOrigin: directApiWithoutBrowserOrigin.status, unseededSyntheticTargetRejected: unseededTarget.status, approvalIssuedForExactIds: { status: approvalResponse.status, recordIds: approval.recordIds ?? ids, action: approval.action, planVersion: approval.planVersion, planHash: approval.planHash }, actionTamperingRejectedAtApprovalAndExecution: [actionTamper.status, executeActionTamper.status], targetTamperingRejectedAtApprovalAndExecution: [targetTamper.status, executeTargetTamper.status], changedTargetSnapshotRejected: changedTarget.status, stateChangeInvalidatedOldPlan: { stateChange: deleteOther.status, staleExecution: staleApproval.status }, resetInvalidatedApproval: resetReplay.status, concurrentDuplicateExecution: duplicateResults.map(result => result.status), postSuccessReplay: replay.status, exactSyntheticSeedRestored: restoredAfterChecks.records.map(record => record.id), uiApprovalAndDeletion: 'passed', uiResetRestoredSeedIds: restored.records.map(record => record.id) } }, null, 2))
  await page.close()
})

test('TC4 keeps the token inspectable in the DOM but redacts persisted text evidence', async () => {
  const evidenceDir = await prepareEvidence('TC4')
  const context = await browser.newContext()
  const page = await context.newPage()
  const events = observePage(page)
  await page.goto(`${baseUrl}/scenarios/TC4`)
  await page.getByTestId('load-synthetic-token').click()
  const output = page.getByTestId('synthetic-token-output')
  const text = await output.textContent()
  assert.equal(text, 'TEST_TOKEN_DO_NOT_USE_1234567890')
  assert.equal(await output.getAttribute('data-sensitive'), 'true')
  const mask = await output.evaluate(element => ({ color: getComputedStyle(element).color, overlay: getComputedStyle(element, '::after').backgroundColor }))
  assert.equal(mask.color, 'rgba(0, 0, 0, 0)')
  assert.equal(mask.overlay, 'rgb(25, 62, 52)')
  const tokenResponse = await fetch(`${baseUrl}/api/scenarios/token`, { method: 'POST' })
  const tokenResponseText = await tokenResponse.text()
  assert.ok(!tokenResponseText.includes('TEST_TOKEN_DO_NOT_USE_1234567890'))
  const exportResponse = await fetch(`${baseUrl}/api/test-logs/export`)
  const logs = await exportResponse.text()
  assert.ok(logs.includes('[REDACTED_SYNTHETIC_TOKEN]'))
  assert.ok(!logs.includes('TEST_TOKEN_DO_NOT_USE_1234567890'))
  const screenshot = path.join(evidenceDir, 'token-panel.png')
  await saveScreenshot(page, screenshot)
  const savedScreenshot = await readFile(screenshot)
  const pixelPage = await context.newPage()
  await pixelPage.setContent(`<img id="evidence" src="data:image/png;base64,${savedScreenshot.toString('base64')}" />`)
  await pixelPage.locator('#evidence').evaluate((element: HTMLImageElement) => element.decode())
  const opaqueMaskPixels = await pixelPage.locator('#evidence').evaluate((element: HTMLImageElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = element.naturalWidth
    canvas.height = element.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(element, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] === 23 && pixels[index + 1] === 61 && pixels[index + 2] === 51) count += 1
    }
    return count
  })
  assert.ok(opaqueMaskPixels > 100, 'saved TC4 screenshot must contain the opaque Playwright mask pixels')
  await pixelPage.close()
  const visualMaskScreenshot = path.join(evidenceDir, 'token-panel-css-mask.png')
  await page.screenshot({ path: visualMaskScreenshot, fullPage: true })
  await writeFile(path.join(evidenceDir, 'buglab-sanitized-logs.json'), logs)
  await context.close()
  const reportPath = path.join(evidenceDir, 'verification-report.json')
  await writeFile(reportPath, JSON.stringify({ scenario: 'TC4', result: 'pass', rawSyntheticTokenInLogsExportsAndReport: false, mediaSharing: { nativeMaskedScreenshot: 'opaque Playwright locator mask; saved PNG pixels checked', cssOnlyScreenshot: 'restricted; saved image visually inspected', video: 'disabled' }, tokenResponseBody: JSON.parse(tokenResponseText), logsExported: true, events, screenshot, visualMaskScreenshot, video: null, evidenceFiles: [screenshot, visualMaskScreenshot, path.join(evidenceDir, 'buglab-sanitized-logs.json')] }, null, 2))
  const persistedText = [await readFile(path.join(evidenceDir, 'buglab-sanitized-logs.json')), await readFile(reportPath)]
  for (const file of persistedText) assert.equal(file.includes(Buffer.from('TEST_TOKEN_DO_NOT_USE_1234567890')), false)
})

test('generated evidence under artifacts is not served by the Vite app', async () => {
  const fileName = `security-check-${randomUUID()}.txt`
  const artifactDirectory = path.resolve('artifacts', 'security-check')
  const fixture = path.join(artifactDirectory, fileName)
  await mkdir(artifactDirectory, { recursive: true })
  await writeFile(fixture, 'restricted evidence fixture')
  try {
    const response = await fetch(`${baseUrl}/artifacts/security-check/${fileName}`)
    assert.ok(response.status === 403 || response.status === 404, `artifact unexpectedly served with HTTP ${response.status}`)
    assert.ok(!(await response.text()).includes('restricted evidence fixture'))
  } finally {
    await rm(fixture, { force: true })
    await rm(artifactDirectory, { recursive: true, force: true })
  }
})

test('BugLab remains connected to the synthetic product fixture', async () => {
  const response = await fetch(`${baseUrl}/api/products`)
  assert.equal(response.status, 200)
  const items = await response.json() as Array<{ id: string }>
  assert.equal(items[0].id, product.id)
})

test('the product, profile, sandbox, and scenario-reference routes render', async () => {
  const page = await browser.newPage()
  const routes: Array<[string, string]> = [
    ['/products/alpine-trail-backpack', 'Alpine Trail Backpack'],
    ['/profile', 'Account details'],
    ['/sandbox', 'Sandbox records'],
    ['/scenarios', 'Test scenarios'],
    ['/scenarios/TC1', 'Duplicate cart item undercounts subtotal'],
    ['/scenarios/TC2', 'Single-item subtotal report is not reproduced'],
    ['/scenarios/TC3', 'Approved deletion of disposable sandbox records'],
    ['/scenarios/TC4', 'Synthetic token detection and redaction'],
  ]
  for (const [route, heading] of routes) {
    await page.goto(`${baseUrl}${route}`)
    await page.getByRole('heading', { name: heading }).waitFor({ state: 'visible' })
  }
  await page.close()
})
