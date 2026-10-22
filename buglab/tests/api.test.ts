import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createServer, type Server } from 'node:http'
import { BugLabStore, seededRecords } from '../server/fixtures.js'
import { product } from '../shared/data.js'
import { createBugLabApp } from '../server/routes.js'
import { redactText, syntheticToken } from '../server/redaction.js'

let server: Server
let baseUrl: string
let store: BugLabStore
let clock: number

beforeEach(async () => {
  store = new BugLabStore()
  clock = Date.now()
  server = createServer(createBugLabApp(store, () => clock))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))

async function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe('BugLab HTTP API', () => {
  it('starts and exposes a local health endpoint', async () => {
    const response = await fetch(`${baseUrl}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok', app: 'BugLab' })
  })

  it('resets to the exact synthetic seed set', async () => {
    store.records.pop()
    store.cart.quantity = 1
    const reset = await post('/api/sandbox/ui-reset', {})
    const first = await reset.json() as { records: unknown[]; cart: { quantity: number } }
    assert.deepEqual(first.records, seededRecords())
    assert.equal(first.cart.quantity, 0)
    store.records.shift()
    const second = await (await post('/api/sandbox/ui-reset', {})).json() as { records: unknown[] }
    assert.deepEqual(second.records, seededRecords())
  })

  it('reproduces the same cart defect and fingerprint after two clean resets (TC1)', async () => {
    const runs: Array<{ actual: number; expected: number; fingerprint: string | null }> = []
    for (let run = 0; run < 2; run += 1) {
      await post('/api/sandbox/ui-reset', {})
      await post('/api/cart/items', { productId: product.id })
      const response = await post('/api/cart/items', { productId: product.id })
      assert.equal(response.status, 200)
      const cart = await response.json() as { subtotalCents: number; expectedSubtotalCents: number; tc1Failure: boolean; fingerprint: string | null }
      assert.equal(cart.tc1Failure, true)
      runs.push({ actual: cart.subtotalCents, expected: cart.expectedSubtotalCents, fingerprint: cart.fingerprint })
    }
    assert.equal(runs[0].actual, 6400)
    assert.equal(runs[0].expected, 12800)
    assert.deepEqual(runs[0], runs[1])
    assert.match(runs[0].fingerprint ?? '', /^[a-f0-9]{64}$/)
  })

  it('does not exhibit the reported duplicate-item failure for one item (TC2)', async () => {
    await post('/api/sandbox/ui-reset', {})
    const response = await post('/api/cart/items', { productId: product.id })
    const cart = await response.json() as { quantity: number; subtotalCents: number; expectedSubtotalCents: number; tc1Failure: boolean; fingerprint: string | null }
    assert.equal(cart.quantity, 1)
    assert.equal(cart.subtotalCents, cart.expectedSubtotalCents)
    assert.equal(cart.tc1Failure, false)
    assert.equal(cart.fingerprint, null)
  })

  it('rejects unapproved deletion, mismatched records, stale approvals, and replay (TC3)', async () => {
    const ids = [store.records[0].id]
    const noApproval = await post('/api/sandbox/records/delete', { approvalId: '00000000-0000-4000-8000-000000000000', recordIds: ids })
    assert.equal(noApproval.status, 403)

    const badPhrase = await post('/api/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'yes' })
    assert.equal(badPhrase.status, 400)

    const first = await post('/api/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD' })
    const firstApproval = await first.json() as { approvalId: string }
    const altered = await post('/api/sandbox/records/delete', { approvalId: firstApproval.approvalId, recordIds: [store.records[1].id] })
    assert.equal(altered.status, 409)

    const stale = await post('/api/sandbox/deletion-approvals', { recordIds: [store.records[0].id], confirmation: 'DELETE 1 SANDBOX RECORD' })
    const staleApproval = await stale.json() as { approvalId: string }
    const second = await post('/api/sandbox/deletion-approvals', { recordIds: [store.records[1].id], confirmation: 'DELETE 1 SANDBOX RECORD' })
    const secondApproval = await second.json() as { approvalId: string }
    assert.equal((await post('/api/sandbox/records/delete', { approvalId: secondApproval.approvalId, recordIds: [store.records[1].id] })).status, 200)
    assert.equal((await post('/api/sandbox/records/delete', { approvalId: staleApproval.approvalId, recordIds: [store.records[0].id] })).status, 409)

    await post('/api/sandbox/ui-reset', {})
    const approved = await post('/api/sandbox/deletion-approvals', { recordIds: [store.records[0].id], confirmation: 'DELETE 1 SANDBOX RECORD' })
    const validApproval = await approved.json() as { approvalId: string }
    const deletion = await post('/api/sandbox/records/delete', { approvalId: validApproval.approvalId, recordIds: [store.records[0].id] })
    assert.equal(deletion.status, 200)
    const replay = await post('/api/sandbox/records/delete', { approvalId: validApproval.approvalId, recordIds: [store.records[0].id] })
    assert.equal(replay.status, 403)
    const reset = await post('/api/sandbox/ui-reset', {})
    assert.deepEqual((await reset.json() as { records: unknown[] }).records, seededRecords())
  })

  it('rejects an expired deletion approval (TC3)', async () => {
    const ids = [store.records[0].id]
    const response = await post('/api/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD' })
    const approval = await response.json() as { approvalId: string }
    clock += 5 * 60_000
    const deletion = await post('/api/sandbox/records/delete', { approvalId: approval.approvalId, recordIds: ids })
    assert.equal(deletion.status, 403)
    assert.equal(store.records.length, 3)
  })

  it('redacts the synthetic token from stored logs and exports (TC4)', async () => {
    const loaded = await post('/api/scenarios/token', {})
    assert.equal((await loaded.json() as { token: string }).token, syntheticToken)
    const variants = [
      'Authorization: Bearer test_secret_12345',
      `access_token=${syntheticToken}`,
      `console: token=${syntheticToken}`,
    ]
    for (const message of variants) {
      const result = await post('/api/test-logs', { type: 'TC4 variant', message })
      assert.equal(result.status, 201)
    }
    assert.equal(redactText(variants[0]), 'Authorization: Bearer [REDACTED]')
    const logs = await (await fetch(`${baseUrl}/api/test-logs`)).text()
    const download = await (await fetch(`${baseUrl}/api/test-logs/export`)).text()
    assert.ok(logs.includes('[REDACTED_SYNTHETIC_TOKEN]'))
    assert.ok(logs.includes('Bearer [REDACTED]'))
    assert.ok(!logs.includes(syntheticToken))
    assert.ok(!download.includes(syntheticToken))
  })

  it('rejects malformed cart and log inputs', async () => {
    assert.equal((await post('/api/cart/items', { productId: 'arbitrary-product' })).status, 400)
    assert.equal((await post('/api/test-logs', { type: 'bad', message: 'x', extra: 'not allowed' })).status, 400)
    assert.equal((await post('/api/sandbox/deletion-approvals', { recordIds: ['../etc/passwd'], confirmation: 'DELETE 1 SANDBOX RECORD' })).status, 400)
  })
})
