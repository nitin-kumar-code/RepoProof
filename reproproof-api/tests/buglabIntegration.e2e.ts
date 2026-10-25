import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { config as loadDotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Browser } from 'playwright'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(apiRoot, '..')
const bugLabRoot = path.join(projectRoot, 'buglab')
loadDotenv({ path: path.join(projectRoot, '.env'), override: false })

type Scenario = {
  id: 'TC1' | 'TC2' | 'TC3' | 'TC4'
  title: string
  description: string
  route: string
  steps: string[]
  expectedBehavior: string
  actualBehavior: string
  result: 'reproduced' | 'not_reproduced'
}

const scenarios: Scenario[] = [
  {
    id: 'TC1', title: 'TC1: Duplicate cart item undercounts subtotal',
    description: 'Reproduce the documented BugLab cart subtotal defect twice from a clean cart.', route: '/',
    steps: ['Navigate to the approved BugLab home page.', 'Click Add Alpine Trail Backpack to cart.', 'Click Add Alpine Trail Backpack to cart.', 'Click Open cart.', 'Take a screenshot of the cart subtotal.'],
    expectedBehavior: 'Cart subtotal equals unit price multiplied by quantity.', actualBehavior: "Cart subtotal omits the second item's price.", result: 'reproduced',
  },
  {
    id: 'TC2', title: 'TC2: Single-item subtotal report is not reproduced',
    description: 'Check the documented single-item subtotal report against a clean BugLab cart.', route: '/',
    steps: ['Navigate to the approved BugLab home page.', 'Click Add Alpine Trail Backpack to cart.', 'Click Open cart.', 'Take a screenshot of the single-item subtotal.'],
    expectedBehavior: 'The subtotal matches the single product price.', actualBehavior: 'The subtotal resets to zero after adding one item.', result: 'not_reproduced',
  },
  {
    id: 'TC3', title: 'TC3: Server approval gates disposable record deletion',
    description: 'Verify direct, stale, replayed, and duplicate deletion requests are rejected; approve and delete only the exact disposable record.', route: '/sandbox',
    steps: ['Navigate to the approved BugLab sandbox page.', 'Click sandbox-order-001.', 'Click Attempt unapproved direct deletion.', 'Verify that the server rejects an unapproved direct deletion request and the seed record remains.', 'Click Review deletion (1).', 'Fill Type DELETE 1 SANDBOX RECORD to approve with DELETE 1 SANDBOX RECORD.', 'Click Approve exact record set.', 'Click Execute approved deletion.'],
    expectedBehavior: 'Unapproved, stale, replayed, or duplicate deletion requests are rejected; an approved request deletes only its exact synthetic target.', actualBehavior: 'A direct or stale deletion approval can remove a sandbox record without a current approval for that exact record set.', result: 'not_reproduced',
  },
  {
    id: 'TC4', title: 'TC4: Synthetic token detection and redaction',
    description: 'Load the controlled token fixture, inspect redacted logs and a visually masked screenshot.', route: '/scenarios/TC4',
    steps: ['Navigate to the approved BugLab TC4 token scenario.', 'Click Load synthetic token.', 'Wait 500 milliseconds for the masked output to load.', 'Take a screenshot of the masked synthetic token output.'],
    expectedBehavior: 'Token-like values are redacted from shareable text and masked or restricted in media.', actualBehavior: 'The synthetic token is exposed unredacted in shareable text or media evidence.', result: 'not_reproduced',
  },
]

const selectedScenarioIds = process.env.BUGLAB_E2E_SCENARIOS?.split(',').map(value => value.trim()).filter(Boolean)
const scenariosToRun = selectedScenarioIds?.length
  ? scenarios.filter(scenario => selectedScenarioIds.includes(scenario.id))
  : scenarios
if (selectedScenarioIds?.some(id => !scenarios.some(scenario => scenario.id === id)) || !scenariosToRun.length) {
  throw new Error('BUGLAB_E2E_SCENARIOS must contain supported IDs: TC1, TC2, TC3, TC4')
}

const children: Array<{ name: string; child: ChildProcess; output: string }> = []
const createdRows: Array<{ runId: string; bugReportId: string }> = []
let browser: Browser | undefined
let evidenceRoot = ''

async function freePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

function start(name: string, cwd: string, cli: string, args: string[], extraEnv: Record<string, string>): void {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const entry = { name, child, output: '' }
  children.push(entry)
  child.stdout?.on('data', chunk => { entry.output = `${entry.output}${chunk}`.slice(-20_000) })
  child.stderr?.on('data', chunk => { entry.output = `${entry.output}${chunk}`.slice(-20_000) })
}

async function waitFor(url: string, name: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const child = children.find(item => item.name === name)?.child
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`${name} exited early. ${children.find(item => item.name === name)?.output ?? ''}`)
    }
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return
    } catch { /* service is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`${name} did not become healthy. ${children.find(item => item.name === name)?.output ?? ''}`)
}

async function getJson<T>(base: string, route: string): Promise<T> {
  const response = await fetch(`${base}${route}`)
  const body = await response.json() as T
  assert.equal(response.ok, true, `${route} returned ${response.status}`)
  return body
}

async function waitForTerminal(apiBase: string, runId: string, apiOutput: () => string): Promise<Record<string, any>> {
  const terminal = new Set(['reproduced', 'not_reproduced', 'inconclusive', 'failed'])
  const deadline = Date.now() + 60_000
  const queuedSince = Date.now()
  while (Date.now() < deadline) {
    const run = await getJson<Record<string, any>>(apiBase, `/api/runs/${encodeURIComponent(runId)}`)
    if (terminal.has(run.status)) return run
    if (run.status === 'approved' && run.progress?.phase === 'queued') {
      if (apiOutput().includes('plan_hash is ambiguous')) {
        throw new Error('The configured Supabase database still has the old queue function. Apply reproproof-api/supabase/migrations/202610210001_fix_claim_run_job_plan_hash_ambiguity.sql in the Supabase SQL Editor, then rerun this test.')
      }
      if (Date.now() - queuedSince > 30_000) {
        throw new Error(`Run ${runId} remained queued for 30 seconds. Check the durable worker logs and apply the queue migration if the claim function reports a plan_hash ambiguity. Progress: ${JSON.stringify(run.progress)}`)
      }
    }
    await new Promise(resolve => setTimeout(resolve, 750))
  }
  throw new Error(`Run ${runId} did not finish within one minute`)
}

async function readEvidence(apiBase: string, runId: string, record: Record<string, any>): Promise<Buffer> {
  assert.equal(record.sanitized, true)
  assert.equal(record.restricted, false)
  assert.equal(typeof record.downloadUrl, 'string')
  const url = new URL(record.downloadUrl, apiBase)
  assert.equal(url.origin, apiBase)
  const response = await fetch(url)
  assert.equal(response.ok, true, `Evidence download failed: ${record.type}`)
  return Buffer.from(await response.arrayBuffer())
}

const canRun = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  && process.env.APPROVAL_USERNAME && process.env.APPROVAL_PASSWORD)

test('ReproProof completes BugLab TC1–TC4 through report, plan, approval, browser execution and evidence', {
  skip: canRun ? false : 'Requires configured Supabase tables/queue and server-side approval credentials from the project .env',
  timeout: 12 * 60_000,
}, async () => {
  const ports: number[] = []
  while (ports.length < 4) {
    const candidate = await freePort()
    if (!ports.includes(candidate)) ports.push(candidate)
  }
  const [apiPort, webPort, targetPort, targetApiPort] = ports
  const apiBase = `http://127.0.0.1:${apiPort}`
  const webBase = `http://127.0.0.1:${webPort}`
  const targetBase = `http://127.0.0.1:${targetPort}`
  const resetToken = `buglab-e2e-${randomUUID()}-${randomUUID()}`
  evidenceRoot = await mkdtemp(path.join(tmpdir(), 'reproproof-buglab-integration-'))
  let workflowCompleted = false

  start('BugLab API', bugLabRoot, path.join(bugLabRoot, 'node_modules/tsx/dist/cli.mjs'), ['server/index.ts'], {
    BUGLAB_HOST: '127.0.0.1', BUGLAB_PORT: String(targetApiPort), BUGLAB_RESET_TOKEN: resetToken,
    BUGLAB_UI_ORIGINS: targetBase, BUGLAB_WEB_PORT: String(targetPort), BUGLAB_WEB_HOST: '127.0.0.1',
    BUGLAB_APPROVAL_USERNAME: process.env.APPROVAL_USERNAME!, BUGLAB_APPROVAL_PASSWORD: process.env.APPROVAL_PASSWORD!,
  })
  start('BugLab web', bugLabRoot, path.join(bugLabRoot, 'node_modules/vite/bin/vite.js'), ['--host', '127.0.0.1', '--port', String(targetPort), '--strictPort'], {
    BUGLAB_WEB_HOST: '127.0.0.1', BUGLAB_WEB_PORT: String(targetPort), VITE_BUGLAB_API_PROXY: `http://127.0.0.1:${targetApiPort}`,
  })
  start('ReproProof API', apiRoot, path.join(apiRoot, 'node_modules/tsx/dist/cli.mjs'), ['src/server.ts'], {
    APP_ENV: 'development', PORT: String(apiPort), CORS_ORIGIN: webBase,
    ALLOW_INSECURE_LOCAL_TARGETS: 'true', ALLOWED_TARGET_ORIGINS: targetBase,
    ALLOWED_RESOURCE_ORIGINS: targetBase, BUGLAB_BASE_URL: targetBase,
    BUGLAB_API_BASE_URL: targetBase,
    VERIFICATION_RESET_URL: `${targetBase}/api/sandbox/reset`, VERIFICATION_RESET_TOKEN: resetToken,
    PLANNER_MODE: 'mock', RUN_ARTIFACTS_DIR: evidenceRoot,
  })
  start('ReproProof web', projectRoot, path.join(projectRoot, 'node_modules/vite/bin/vite.js'), ['--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    VITE_API_BASE_URL: apiBase,
  })

  try {
    process.stderr.write('Starting BugLab API and web, then ReproProof API and frontend.\n')
    await waitFor(`http://127.0.0.1:${targetApiPort}/health`, 'BugLab API')
    await waitFor(`${targetBase}/`, 'BugLab web')
    await waitFor(`${apiBase}/health`, 'ReproProof API', 30_000)
    await waitFor(webBase, 'ReproProof web')
    await new Promise(resolve => setTimeout(resolve, 3500))
    const apiOutput = children.find(item => item.name === 'ReproProof API')?.output ?? ''
    if (apiOutput.includes('plan_hash is ambiguous')) {
      throw new Error('The configured Supabase database still has the old queue function. Apply reproproof-api/supabase/migrations/202610210001_fix_claim_run_job_plan_hash_ambiguity.sql in the Supabase SQL Editor, then rerun this test.')
    }
    browser = await chromium.launch({ headless: true })

    const config = await getJson<{ enabled: boolean; baseUrl: string | null }>(apiBase, '/api/demo/buglab')
    assert.equal(config.enabled, true)
    assert.equal(config.baseUrl, targetBase)

    const results: Array<Record<string, unknown>> = []
    const observations: Array<Record<string, unknown>> = []
    for (const scenario of scenariosToRun) {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`${webBase}/new-bug`)
      await page.locator('label').filter({ hasText: 'Controlled demo scenario' }).locator('select').selectOption(scenario.id)
      await page.getByRole('button', { name: 'Submit Bug Report' }).click()
      await page.waitForURL(/\/runs\/[^/]+$/)
      const runId = new URL(page.url()).pathname.split('/').at(-1)!
      await page.getByText('Review the proposed actions and approve the plan before running Chromium.').waitFor()
      assert.ok(await page.locator('.plan-steps li').count() >= scenario.steps.length)

      const premature = await fetch(`${apiBase}/api/runs/${encodeURIComponent(runId)}/execute`, { method: 'POST' })
      assert.equal(premature.status, 409, `${scenario.id} execution bypassed the human gate`)
      const pending = await getJson<Record<string, any>>(apiBase, `/api/runs/${encodeURIComponent(runId)}`)
      assert.equal(pending.status, 'awaiting_approval')
      assert.equal(pending.execution, null)
      createdRows.push({ runId, bugReportId: pending.bugReportId })

      await page.getByLabel('Approver username').fill(process.env.APPROVAL_USERNAME!)
      await page.getByLabel('Password').fill(process.env.APPROVAL_PASSWORD!)
      await page.getByRole('button', { name: 'Approve plan' }).click()
      await page.getByRole('button', { name: 'Run approved plan' }).waitFor({ timeout: 15_000 })
      const approved = await getJson<Record<string, any>>(apiBase, `/api/runs/${encodeURIComponent(runId)}`)
      assert.equal(approved.status, 'approved')
      assert.equal(approved.approval.decision, 'approved')
      assert.equal(approved.approval.planHash, approved.planHash)
      await page.getByRole('button', { name: 'Run approved plan' }).click()

      const finalRun = await waitForTerminal(apiBase, runId, () => children.find(item => item.name === 'ReproProof API')?.output ?? '')
      assert.equal(finalRun.status, scenario.result, `${scenario.id}: ${finalRun.execution?.error ?? 'unexpected verdict'}`)
      await page.getByText(`Browser verification finished: ${scenario.result.replaceAll('_', ' ')}.`).waitFor({ timeout: 20_000 })
      assert.equal(finalRun.execution.attempts.length, 2)
      assert.ok(finalRun.execution.attempts.every((attempt: Record<string, any>) => attempt.completed))
      assert.ok(finalRun.execution.attempts.every((attempt: Record<string, any>) => attempt.evidenceRecords.some((file: Record<string, any>) => file.type === 'screenshot')))
      assert.ok(finalRun.execution.attempts.every((attempt: Record<string, any>) => attempt.evidenceRecords.some((file: Record<string, any>) => file.type === 'network')))
      assert.ok(finalRun.execution.attempts.every((attempt: Record<string, any>) => attempt.telemetry.some((event: Record<string, any>) => event.type === 'request')))
      const attemptVideos = finalRun.execution.attempts.map((attempt: Record<string, any>) => attempt.evidenceRecords.filter((file: Record<string, any>) => file.type === 'video'))
      if (scenario.id === 'TC1') {
        assert.ok(attemptVideos.every((files: Array<Record<string, any>>) => files.length === 1 && files[0].sanitized === false), 'TC1 recording must be present and marked unsanitized in both attempts')
      } else {
        assert.ok(attemptVideos.every((files: Array<Record<string, any>>) => files.length === 0), `${scenario.id} must not record video`)
      }
      if (scenario.id === 'TC1') {
        assert.equal(finalRun.execution.attempts[0].fingerprint.hash, finalRun.execution.attempts[1].fingerprint.hash)
        assert.ok(finalRun.execution.attempts.every((attempt: Record<string, any>) => attempt.telemetry.some((event: Record<string, any>) => event.type === 'console_error' && event.message.includes("Cart subtotal omits the second item's price."))))
        const cart = await getJson<{ quantity: number; unitPriceCents: number; subtotalCents: number; expectedSubtotalCents: number }>(targetBase, '/api/cart')
        assert.deepEqual({ quantity: cart.quantity, unitPriceCents: cart.unitPriceCents, subtotalCents: cart.subtotalCents, expectedSubtotalCents: cart.expectedSubtotalCents }, { quantity: 2, unitPriceCents: 6400, subtotalCents: 6400, expectedSubtotalCents: 12800 })
        observations.push({ scenario: 'TC1', attemptState: 'reset before both attempts', quantity: cart.quantity, unitPriceCents: cart.unitPriceCents, observedSubtotalCents: cart.subtotalCents, expectedSubtotalCents: cart.expectedSubtotalCents, fingerprintStable: true })
      }
      if (scenario.id === 'TC3') {
        const remaining = await getJson<{ records: Array<{ id: string }> }>(targetBase, '/api/sandbox/records')
        assert.deepEqual(remaining.records.map(record => record.id), ['sandbox-customer-001', 'sandbox-cart-001'])

        const securityHeaders = { 'Content-Type': 'application/json', Origin: targetBase, 'Sec-Fetch-Site': 'same-origin' }
        const targetPost = (route: string, body: unknown) => fetch(`${targetBase}/api${route}`, { method: 'POST', headers: securityHeaders, body: JSON.stringify(body) })
        const resetTarget = async () => {
          const resetResponse = await fetch(`${targetBase}/api/sandbox/reset`, { method: 'POST', headers: { ...securityHeaders, Authorization: `Bearer ${resetToken}` }, body: JSON.stringify({ runId, bugReportId: finalRun.bugReportId }) })
          assert.equal(resetResponse.status, 200, 'authorized sandbox reset should restore synthetic fixtures')
        }
        await resetTarget()
        const currentState = await getJson<{ stateVersion: number; records: Array<{ id: string }> }>(targetBase, '/api/sandbox/records')
        const directDelete = await targetPost('/sandbox/records/delete', { approvalId: randomUUID(), action: 'delete_records', recordIds: ['sandbox-order-001'], planVersion: currentState.stateVersion, planHash: '0'.repeat(64) })
        assert.equal(directDelete.status, 403)
        const unseededApproval = await targetPost('/sandbox/deletion-approvals', { recordIds: ['sandbox-order-999'], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: currentState.stateVersion })
        assert.equal(unseededApproval.status, 409)

        const approvalResponse = await targetPost('/sandbox/deletion-approvals', { recordIds: ['sandbox-order-001'], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: currentState.stateVersion })
        assert.equal(approvalResponse.status, 201)
        const approval = await approvalResponse.json() as { approvalId: string; action: string; recordIds: string[]; planVersion: number; planHash: string }
        assert.deepEqual({ action: approval.action, recordIds: approval.recordIds, planVersion: approval.planVersion }, { action: 'delete_records', recordIds: ['sandbox-order-001'], planVersion: currentState.stateVersion })
        const alteredTarget = await targetPost('/sandbox/records/delete', { approvalId: approval.approvalId, action: approval.action, recordIds: ['sandbox-customer-001'], planVersion: approval.planVersion, planHash: approval.planHash })
        assert.equal(alteredTarget.status, 409)
        const alteredPlan = await targetPost('/sandbox/records/delete', { approvalId: approval.approvalId, action: approval.action, recordIds: approval.recordIds, planVersion: approval.planVersion + 1, planHash: approval.planHash })
        assert.equal(alteredPlan.status, 409)

        const secondApprovalResponse = await targetPost('/sandbox/deletion-approvals', { recordIds: ['sandbox-customer-001'], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: currentState.stateVersion })
        const secondApproval = await secondApprovalResponse.json() as { approvalId: string; action: string; recordIds: string[]; planVersion: number; planHash: string }
        const secondDelete = await targetPost('/sandbox/records/delete', { approvalId: secondApproval.approvalId, action: secondApproval.action, recordIds: secondApproval.recordIds, planVersion: secondApproval.planVersion, planHash: secondApproval.planHash })
        assert.equal(secondDelete.status, 200)
        const staleApproval = await targetPost('/sandbox/records/delete', { approvalId: approval.approvalId, action: approval.action, recordIds: approval.recordIds, planVersion: approval.planVersion, planHash: approval.planHash })
        assert.equal(staleApproval.status, 403)

        await resetTarget()
        const resetState = await getJson<{ stateVersion: number }>(targetBase, '/api/sandbox/records')
        const resetBoundApprovalResponse = await targetPost('/sandbox/deletion-approvals', { recordIds: ['sandbox-order-001'], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: resetState.stateVersion })
        const resetBoundApproval = await resetBoundApprovalResponse.json() as { approvalId: string; action: string; recordIds: string[]; planVersion: number; planHash: string }
        await resetTarget()
        const resetReplay = await targetPost('/sandbox/records/delete', { approvalId: resetBoundApproval.approvalId, action: resetBoundApproval.action, recordIds: resetBoundApproval.recordIds, planVersion: resetBoundApproval.planVersion, planHash: resetBoundApproval.planHash })
        assert.equal(resetReplay.status, 403)

        const raceState = await getJson<{ stateVersion: number }>(targetBase, '/api/sandbox/records')
        const raceApprovalResponse = await targetPost('/sandbox/deletion-approvals', { recordIds: ['sandbox-order-001'], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: raceState.stateVersion })
        const raceApproval = await raceApprovalResponse.json() as { approvalId: string; action: string; recordIds: string[]; planVersion: number; planHash: string }
        const raceBody = { approvalId: raceApproval.approvalId, action: raceApproval.action, recordIds: raceApproval.recordIds, planVersion: raceApproval.planVersion, planHash: raceApproval.planHash }
        const duplicateRequests = await Promise.all([targetPost('/sandbox/records/delete', raceBody), targetPost('/sandbox/records/delete', raceBody)])
        const duplicateStatuses = duplicateRequests.map(response => response.status).sort()
        assert.deepEqual(duplicateStatuses, [200, 403])
        const replay = await targetPost('/sandbox/records/delete', raceBody)
        assert.equal(replay.status, 403)
        await resetTarget()
        const restoredSeed = await getJson<{ records: Array<{ id: string }> }>(targetBase, '/api/sandbox/records')
        assert.deepEqual(restoredSeed.records.map(record => record.id), ['sandbox-order-001', 'sandbox-customer-001', 'sandbox-cart-001'])
        observations.push({ scenario: 'TC3', securityChecks: { directDeleteRejected: directDelete.status, unseededTargetRejected: unseededApproval.status, exactApproval: approvalResponse.status, changedTargetRejected: alteredTarget.status, changedPlanRejected: alteredPlan.status, stateChangeRejectedStaleApproval: staleApproval.status, resetInvalidatedApproval: resetReplay.status, duplicateStatuses, replayRejected: replay.status, resetRestoredSeed: restoredSeed.records.map(record => record.id) } })
      }

      const evidence = await getJson<{ files: Array<Record<string, any>> }>(apiBase, `/api/runs/${encodeURIComponent(runId)}/evidence`)
      assert.ok(evidence.files.some(file => file.type === 'report'))
      assert.ok(evidence.files.some(file => file.type === 'screenshot'))
      assert.ok(evidence.files.some(file => file.type === 'network'))
      if (scenario.id === 'TC1') {
        const recordings = evidence.files.filter(file => file.type === 'video')
        assert.equal(recordings.length, 2, 'TC1 must expose restricted recording metadata for both attempts')
        for (const recording of recordings) {
          assert.equal(recording.sanitized, false)
          assert.equal(recording.restricted, true)
          assert.equal(recording.downloadUrl, null)
          const download = await fetch(`${apiBase}/api/runs/${encodeURIComponent(runId)}/evidence/${encodeURIComponent(String(recording.id))}`)
          assert.equal(download.status, 403, 'Raw TC1 video must not be downloadable or shareable')
        }
      }
      for (const file of evidence.files.filter(item => ['console', 'network', 'report'].includes(item.type))) {
        const text = (await readEvidence(apiBase, runId, file)).toString('utf8')
        assert.ok(!text.includes('TEST_TOKEN_DO_NOT_USE_1234567890'), `${scenario.id} persisted the synthetic token in text evidence`)
      }
      if (scenario.id === 'TC4') {
        assert.equal(evidence.files.some(file => file.type === 'video'), false)
        const screenshotRecord = evidence.files.find(file => file.type === 'screenshot' && file.attemptNumber === 1 && file.storageKey.includes('step-4-'))!
        const screenshot = await readEvidence(apiBase, runId, screenshotRecord)
        const pixelPage = await context.newPage()
        await pixelPage.setContent(`<img id="evidence" src="data:image/png;base64,${screenshot.toString('base64')}" />`)
        await pixelPage.locator('#evidence').evaluate((element: HTMLImageElement) => element.decode())
        const maskedPixels = await pixelPage.locator('#evidence').evaluate((element: HTMLImageElement) => {
          const canvas = document.createElement('canvas')
          canvas.width = element.naturalWidth
          canvas.height = element.naturalHeight
          const context = canvas.getContext('2d')!
          context.drawImage(element, 0, 0)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          let count = 0
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 30 && pixels[i + 1] === 41 && pixels[i + 2] === 59) count += 1
          return count
        })
        assert.ok(maskedPixels > 100, 'TC4 screenshot did not contain the configured opaque mask pixels')
        await pixelPage.close()
      }

      results.push({ scenario: scenario.id, bugReportId: finalRun.bugReportId, runId, verdict: finalRun.execution.result, status: finalRun.status, attempts: finalRun.execution.attempts.map((attempt: Record<string, any>) => ({ completed: attempt.completed, expectedFailureFound: attempt.expectedFailureFound, fingerprint: attempt.fingerprint?.hash ?? null })), evidenceCount: evidence.files.length })
      await page.close()
      await context.close()
    }

    const reportPath = path.join(evidenceRoot, 'integration-summary.json')
    await writeFile(reportPath, JSON.stringify({ scenarios: results, observations, evidenceRoot, docker: 'not used by this local Playwright workflow' }, null, 2), { mode: 0o600 })
    assert.deepEqual(results.map(result => [result.scenario, result.verdict]), scenariosToRun.map(scenario => [scenario.id, scenario.result]))
    workflowCompleted = true
    console.log(`Integrated BugLab workflow evidence: ${reportPath}`)
  } finally {
    await browser?.close()
    for (const entry of [...children].reverse()) {
      entry.child.kill('SIGTERM')
    }
    await Promise.all(children.map(async entry => {
      if (entry.child.exitCode === null) await Promise.race([once(entry.child, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))])
      if (entry.child.exitCode === null) entry.child.kill('SIGKILL')
    }))
    if (!workflowCompleted && createdRows.length && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      for (const row of createdRows) {
        const deletedRun = await db.from('runs').delete().eq('id', row.runId)
        const deletedReport = await db.from('bug_reports').delete().eq('id', row.bugReportId)
        if (deletedRun.error || deletedReport.error) {
          process.stderr.write(`Could not clean failed integration fixture ${row.runId}; inspect and remove its test run/report manually.\n`)
        }
      }
    }
  }
})
