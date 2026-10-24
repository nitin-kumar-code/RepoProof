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
const TEST_RESET_TOKEN = 'buglab-test-reset-secret-9a2b-8f4e6d2c1a'

beforeEach(async () => {
  store = new BugLabStore()
  clock = Date.now()
  server = createServer(createBugLabApp(store, () => clock, { resetToken: TEST_RESET_TOKEN }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))

async function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4173', 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify(body) })
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

  it('rejects cross-origin UI resets and requires a configured verifier secret', async () => {
    const crossOrigin = await fetch(`${baseUrl}/api/sandbox/ui-reset`, { method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(crossOrigin.status, 403)
    const noVerifierCredential = await fetch(`${baseUrl}/api/sandbox/reset`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:4173', 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-1', bugReportId: 'bug-1' }) })
    assert.equal(noVerifierCredential.status, 401)
    const authorizedReset = await fetch(`${baseUrl}/api/sandbox/reset`, { method: 'POST', headers: { Authorization: `Bearer ${TEST_RESET_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-1', bugReportId: 'bug-1' }) })
    assert.equal(authorizedReset.status, 200)
    const malformed = await fetch(`${baseUrl}/api/sandbox/reset`, { method: 'POST', headers: { Authorization: `Bearer ${TEST_RESET_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-1', bugReportId: 'bug-1', targetUrl: 'https://attacker.example' }) })
    assert.equal(malformed.status, 400)
    const noResetToken = createServer(createBugLabApp(new BugLabStore(), Date.now, { resetToken: '' }))
    await new Promise<void>(resolve => noResetToken.listen(0, '127.0.0.1', resolve))
    const address = noResetToken.address()
    assert.ok(address && typeof address !== 'string')
    try {
      const unavailable = await fetch(`http://127.0.0.1:${address.port}/api/sandbox/reset`, { method: 'POST', headers: { Authorization: `Bearer ${TEST_RESET_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-1', bugReportId: 'bug-1' }) })
      assert.equal(unavailable.status, 503)
    } finally {
      await new Promise<void>((resolve, reject) => noResetToken.close(error => error ? reject(error) : resolve()))
    }
    const weakResetToken = createServer(createBugLabApp(new BugLabStore(), Date.now, { resetToken: 'replace-with-a-random-secret' }))
    await new Promise<void>(resolve => weakResetToken.listen(0, '127.0.0.1', resolve))
    const weakAddress = weakResetToken.address()
    assert.ok(weakAddress && typeof weakAddress !== 'string')
    try {
      const unavailable = await fetch(`http://127.0.0.1:${weakAddress.port}/api/sandbox/reset`, { method: 'POST', headers: { Authorization: 'Bearer replace-with-a-random-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: 'run-1', bugReportId: 'bug-1' }) })
      assert.equal(unavailable.status, 503)
    } finally {
      await new Promise<void>((resolve, reject) => weakResetToken.close(error => error ? reject(error) : resolve()))
    }
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
    const noApproval = await post('/api/sandbox/records/delete', { approvalId: '00000000-0000-4000-8000-000000000000', action: 'delete_records', recordIds: ids, planVersion: store.stateVersion, planHash: '0'.repeat(64) })
    assert.equal(noApproval.status, 403)

    const badPhrase = await post('/api/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'yes', planVersion: store.stateVersion })
    assert.equal(badPhrase.status, 400)

    const first = await post('/api/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: store.stateVersion })
    const firstApproval = await first.json() as { approvalId: string; action: 'delete_records'; planVersion: number; planHash: string }
    const altered = await post('/api/sandbox/records/delete', { approvalId: firstApproval.approvalId, action: firstApproval.action, recordIds: [store.records[1].id], planVersion: firstApproval.planVersion, planHash: firstApproval.planHash })
    assert.equal(altered.status, 409)

    const stale = await post('/api/sandbox/deletion-approvals', { recordIds: [store.records[0].id], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: store.stateVersion })
    const staleApproval = await stale.json() as { approvalId: string; action: 'delete_records'; planVersion: number; planHash: string }
    const second = await post('/api/sandbox/deletion-approvals', { recordIds: [store.records[1].id], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: store.stateVersion })
    const secondApproval = await second.json() as { approvalId: string; action: 'delete_records'; planVersion: number; planHash: string }
    assert.equal((await post('/api/sandbox/records/delete', { approvalId: secondApproval.approvalId, action: secondApproval.action, recordIds: [store.records[1].id], planVersion: secondApproval.planVersion, planHash: secondApproval.planHash })).status, 200)
    assert.equal((await post('/api/sandbox/records/delete', { approvalId: staleApproval.approvalId, action: staleApproval.action, recordIds: [store.records[0].id], planVersion: staleApproval.planVersion, planHash: staleApproval.planHash })).status, 409)

    await post('/api/sandbox/ui-reset', {})
    const approved = await post('/api/sandbox/deletion-approvals', { recordIds: [store.records[0].id], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: store.stateVersion })
    const validApproval = await approved.json() as { approvalId: string; action: 'delete_records'; planVersion: number; planHash: string }
    const deletion = await post('/api/sandbox/records/delete', { approvalId: validApproval.approvalId, action: validApproval.action, recordIds: [store.records[0].id], planVersion: validApproval.planVersion, planHash: validApproval.planHash })
    assert.equal(deletion.status, 200)
    const replay = await post('/api/sandbox/records/delete', { approvalId: validApproval.approvalId, action: validApproval.action, recordIds: [store.records[0].id], planVersion: validApproval.planVersion, planHash: validApproval.planHash })
    assert.equal(replay.status, 403)
    const reset = await post('/api/sandbox/ui-reset', {})
    assert.deepEqual((await reset.json() as { records: unknown[] }).records, seededRecords())
  })

  it('binds destructive approval to the exact action, target snapshot, version, and one-time use', async () => {
    const crossOrigin = await fetch(`${baseUrl}/api/sandbox/deletion-approvals`, { method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ recordIds: [store.records[0].id], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: store.stateVersion }) })
    assert.equal(crossOrigin.status, 403)
    const approvalResponse = await post('/api/sandbox/deletion-approvals', { recordIds: [store.records[0].id], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: store.stateVersion })
    const approval = await approvalResponse.json() as { approvalId: string; action: string; recordIds: string[]; planVersion: number; planHash: string }
    assert.equal(approval.action, 'delete_records')
    assert.deepEqual(approval.recordIds, [store.records[0].id])
    assert.equal(approval.planVersion, store.stateVersion)
    assert.match(approval.planHash, /^[a-f0-9]{64}$/)

    const wrongVersion = await post('/api/sandbox/records/delete', { approvalId: approval.approvalId, action: approval.action, recordIds: approval.recordIds, planVersion: approval.planVersion + 1, planHash: approval.planHash })
    assert.equal(wrongVersion.status, 409)
    const wrongHash = await post('/api/sandbox/records/delete', { approvalId: approval.approvalId, action: approval.action, recordIds: approval.recordIds, planVersion: approval.planVersion, planHash: '0'.repeat(64) })
    assert.equal(wrongHash.status, 409)

    store.records[0].name = 'Unexpectedly modified record'
    const changedTarget = await post('/api/sandbox/records/delete', { approvalId: approval.approvalId, action: approval.action, recordIds: approval.recordIds, planVersion: approval.planVersion, planHash: approval.planHash })
    assert.equal(changedTarget.status, 409)
    assert.equal(store.records.length, 3)

    await post('/api/sandbox/ui-reset', {})
    const currentVersion = store.stateVersion
    const freshResponse = await post('/api/sandbox/deletion-approvals', { recordIds: [store.records[0].id], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: currentVersion })
    const fresh = await freshResponse.json() as { approvalId: string; action: 'delete_records'; recordIds: string[]; planVersion: number; planHash: string }
    const payload = { approvalId: fresh.approvalId, action: fresh.action, recordIds: fresh.recordIds, planVersion: fresh.planVersion, planHash: fresh.planHash }
    const outcomes = await Promise.all([post('/api/sandbox/records/delete', payload), post('/api/sandbox/records/delete', payload)])
    assert.deepEqual(outcomes.map(response => response.status).sort(), [200, 403])
    assert.equal(store.records.some(record => record.id === fresh.recordIds[0]), false)
    assert.equal(store.records.length, 2)
  })

  it('fails closed when destructive browser requests omit an allowed Origin', async () => {
    const body = { recordIds: [store.records[0].id], confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: store.stateVersion }
    const approval = await fetch(`${baseUrl}/api/sandbox/deletion-approvals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(approval.status, 403)
    const deletion = await fetch(`${baseUrl}/api/sandbox/records/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalId: '00000000-0000-4000-8000-000000000000', action: 'delete_records', recordIds: [store.records[0].id], planVersion: store.stateVersion, planHash: '0'.repeat(64) }) })
    assert.equal(deletion.status, 403)
    assert.equal(store.records.length, 3)
  })

  it('rejects an expired deletion approval (TC3)', async () => {
    const ids = [store.records[0].id]
    const response = await post('/api/sandbox/deletion-approvals', { recordIds: ids, confirmation: 'DELETE 1 SANDBOX RECORD', planVersion: store.stateVersion })
    const approval = await response.json() as { approvalId: string; action: 'delete_records'; planVersion: number; planHash: string }
    clock += 5 * 60_000
    const deletion = await post('/api/sandbox/records/delete', { approvalId: approval.approvalId, action: approval.action, recordIds: ids, planVersion: approval.planVersion, planHash: approval.planHash })
    assert.equal(deletion.status, 403)
    assert.equal(store.records.length, 3)
  })

  it('redacts the synthetic token from stored logs and exports (TC4)', async () => {
    const loaded = await post('/api/scenarios/token', {})
    assert.equal(loaded.status, 200)
    assert.ok(!(await loaded.text()).includes(syntheticToken))
    const variants = [
      'Authorization: Bearer test_secret_12345',
      'observed value Bearer test_secret_12345 in a safe test event',
      `access_token=${syntheticToken}`,
      `console: token=${syntheticToken}`,
      'Cookie: session_id=synthetic-session-123',
      'Set-Cookie: client_secret=synthetic-secret-456; HttpOnly',
      'password=synthetic-password-789',
    ]
    for (const message of variants) {
      const result = await post('/api/test-logs', { type: 'TC4 variant', message })
      assert.equal(result.status, 201)
    }
    const typeSecret = await post('/api/test-logs', { type: 'Bearer test_secret_12345', message: 'harmless event' })
    assert.equal(typeSecret.status, 201)
    assert.equal(redactText(variants[0]), 'Authorization:[REDACTED]')
    assert.equal(redactText('?session_id=abc12345&user=1'), '?session_id=[REDACTED]&user=1')
    const logs = await (await fetch(`${baseUrl}/api/test-logs`)).text()
    const download = await (await fetch(`${baseUrl}/api/test-logs/export`)).text()
    assert.ok(logs.includes('[REDACTED_SYNTHETIC_TOKEN]'))
    assert.ok(logs.includes('Bearer [REDACTED]'))
    assert.ok(!logs.includes(syntheticToken))
    assert.ok(!download.includes(syntheticToken))
    assert.ok(!logs.includes('test_secret_12345'))
    assert.ok(!download.includes('test_secret_12345'))
  })

  it('redacts configured secrets from persisted log types, messages, and exports', async () => {
    const configured = [
      ['BUGLAB_TEST_API_KEY', 'configured-secret-value-987'],
      ['SUPABASE_SERVICE_ROLE_KEY', 'service-role-secret-value-123'],
    ] as const
    const previous = configured.map(([name]) => process.env[name])
    for (const [name, secret] of configured) process.env[name] = secret
    try {
      const response = await post('/api/test-logs', { type: `credential ${configured[0][1]}`, message: `request contained ${configured[0][1]} and ${configured[1][1]}` })
      assert.equal(response.status, 201)
      const persisted = await (await fetch(`${baseUrl}/api/test-logs`)).text()
      const exported = await (await fetch(`${baseUrl}/api/test-logs/export`)).text()
      for (const [, secret] of configured) {
        assert.ok(!persisted.includes(secret))
        assert.ok(!exported.includes(secret))
      }
      assert.ok(persisted.includes('[REDACTED]'))
    } finally {
      configured.forEach(([name], index) => {
        if (previous[index] === undefined) delete process.env[name]
        else process.env[name] = previous[index]
      })
    }
  })

  it('returns generic errors without stack traces or environment data', async () => {
    const malformed = await fetch(`${baseUrl}/api/test-logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"type":' })
    assert.equal(malformed.status, 400)
    const body = await malformed.text()
    assert.equal(body, '{"error":"invalid_request"}')
    assert.ok(!body.includes('stack'))
    assert.ok(!body.includes('BUGLAB_RESET_TOKEN'))
  })

  it('rejects malformed cart and log inputs', async () => {
    assert.equal((await post('/api/cart/items', { productId: 'arbitrary-product' })).status, 400)
    assert.equal((await post('/api/test-logs', { type: 'bad', message: 'x', extra: 'not allowed' })).status, 400)
    assert.equal((await post('/api/sandbox/deletion-approvals', { recordIds: ['../etc/passwd'], confirmation: 'DELETE 1 SANDBOX RECORD' })).status, 400)
  })
})
