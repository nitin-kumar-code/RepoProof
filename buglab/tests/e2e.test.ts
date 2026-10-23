import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { chromium, type Browser } from '@playwright/test'
import { createServer as createViteServer, type ViteDevServer } from 'vite'
import { createBugLabApp } from '../server/routes.js'
import { product } from '../shared/data.js'

let apiServer: Server
let vite: ViteDevServer
let browser: Browser
let baseUrl: string

before(async () => {
  apiServer = createServer(createBugLabApp())
  await new Promise<void>(resolve => apiServer.listen(0, '127.0.0.1', resolve))
  const apiAddress = apiServer.address()
  assert.ok(apiAddress && typeof apiAddress !== 'string')
  vite = await createViteServer({
    configFile: new URL('../vite.config.ts', import.meta.url).pathname,
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
  browser = await chromium.launch({ headless: true })
})

after(async () => {
  await browser?.close()
  await vite?.close()
  if (apiServer?.listening) await new Promise<void>((resolve, reject) => apiServer.close(error => error ? reject(error) : resolve()))
})

async function reset(): Promise<void> {
  const response = await fetch(`${baseUrl}/api/sandbox/ui-reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(response.status, 200)
}

test('TC1 repeats the same cart defect in two fresh browser contexts', async () => {
  const observations: string[] = []
  const consoleObservations: string[] = []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await reset()
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(baseUrl)
    await page.getByTestId('add-to-cart').click()
    const consoleEvent = page.waitForEvent('console', { predicate: message => message.type() === 'error' && message.text().includes("Cart subtotal omits the second item's price.") })
    await page.getByTestId('add-to-cart').click()
    const message = await consoleEvent
    consoleObservations.push(`${message.type()}:${message.text()}`)
    await page.goto(`${baseUrl}/cart`)
    await page.getByTestId('tc1-failure').waitFor({ state: 'visible' })
    const cart = await (await fetch(`${baseUrl}/api/cart`)).json() as { fingerprint: string; subtotalCents: number; expectedSubtotalCents: number }
    observations.push(`${cart.fingerprint}:${cart.subtotalCents}:${cart.expectedSubtotalCents}`)
    assert.equal(await page.getByTestId('cart-quantity-value').innerText(), 'Qty 2')
    await context.close()
  }
  assert.equal(observations[0], observations[1])
  assert.equal(consoleObservations.length, 2)
  assert.equal(consoleObservations[0], consoleObservations[1])
})

test('TC2 completes a clean single-item scenario without the reported failure', async () => {
  await reset()
  const page = await browser.newPage()
  await page.goto(baseUrl)
  await page.getByTestId('add-to-cart').click()
  await page.goto(`${baseUrl}/cart`)
  assert.equal(await page.getByTestId('cart-subtotal').innerText(), '$64.00')
  assert.equal(await page.getByTestId('tc1-failure').count(), 0)
  const cart = await (await fetch(`${baseUrl}/api/cart`)).json() as { tc1Failure: boolean; subtotalCents: number; expectedSubtotalCents: number }
  assert.equal(cart.tc1Failure, false)
  assert.equal(cart.subtotalCents, cart.expectedSubtotalCents)
  await page.close()
})

test('TC3 requires scoped approval in the UI and only deletes the approved synthetic fixture', async () => {
  await reset()
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/sandbox`)
  const row = page.getByTestId('sandbox-record').filter({ hasText: 'sandbox-order-001' })
  await row.getByRole('checkbox').check()
  await page.getByTestId('delete-record').click()
  await assert.doesNotReject(() => page.getByTestId('delete-confirmation').waitFor())
  await page.getByTestId('delete-approval-phrase').fill('DELETE 1 SANDBOX RECORD')
  await page.getByTestId('approve-deletion').click()
  await page.getByTestId('delete-approved-records').click()
  await page.getByText('Deleted 1 approved disposable record(s).').waitFor()
  const remaining = await (await fetch(`${baseUrl}/api/sandbox/records`)).json() as { records: Array<{ id: string }> }
  assert.deepEqual(remaining.records.map(record => record.id), ['sandbox-customer-001', 'sandbox-cart-001'])
  await page.close()
})

test('TC4 keeps the token inspectable in the DOM but redacted in stored/exported logs', async () => {
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/scenarios/TC4`)
  await page.getByTestId('load-synthetic-token').click()
  const output = page.getByTestId('synthetic-token-output')
  const text = await output.textContent()
  assert.equal(text, 'TEST_TOKEN_DO_NOT_USE_1234567890')
  assert.equal(await output.getAttribute('data-sensitive'), 'true')
  const styles = await output.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-text-security'))
  assert.equal(styles, 'disc')
  const logs = await (await fetch(`${baseUrl}/api/test-logs/export`)).text()
  assert.ok(logs.includes('[REDACTED_SYNTHETIC_TOKEN]'))
  assert.ok(!logs.includes('TEST_TOKEN_DO_NOT_USE_1234567890'))
  await page.screenshot({ type: 'png' })
  await page.close()
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
