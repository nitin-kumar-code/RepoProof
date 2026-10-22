import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import express, { type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { BugLabStore } from './fixtures.js'
import { product, type SandboxRecord } from '../shared/data.js'
import { redactText, safeLogMessage, syntheticToken } from './redaction.js'
import { scenarios } from '../shared/scenarios.js'

const RecordIdsSchema = z.object({ recordIds: z.array(z.string().regex(/^sandbox-[a-z]+-\d{3}$/)).min(1).max(20) }).strict()
const ApprovalSchema = RecordIdsSchema.extend({ confirmation: z.string().min(1).max(100) }).strict()
const DeleteSchema = RecordIdsSchema.extend({ approvalId: z.string().uuid() }).strict()
const LogInputSchema = z.object({ type: z.string().trim().min(1).max(50), message: z.string().max(5000) }).strict()

interface DeletionApproval {
  id: string
  recordIds: string[]
  snapshot: string
  expiresAt: number
  approvedAt: string
}

function localRequest(request: Request): boolean {
  const address = request.socket.remoteAddress?.replace(/^::ffff:/, '')
  return address === '127.0.0.1' || address === '::1'
}

function loopbackOnly(request: Request, response: Response, next: NextFunction): void {
  if (!localRequest(request)) {
    response.status(403).json({ error: 'loopback_only', message: 'BugLab is restricted to local requests.' })
    return
  }
  next()
}

function digestRecords(records: SandboxRecord[], version: number): string {
  const canonical = JSON.stringify({ version, records: [...records].sort((a, b) => a.id.localeCompare(b.id)) })
  return createHash('sha256').update(canonical).digest('hex')
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function resetAuthorization(request: Request): boolean {
  const expected = process.env.BUGLAB_RESET_TOKEN
  if (!expected) return true
  const header = request.header('authorization') ?? ''
  return header.startsWith('Bearer ') && constantTimeEqual(header.slice(7), expected)
}

function confirmationPhrase(count: number): string {
  return `DELETE ${count} SANDBOX RECORD${count === 1 ? '' : 'S'}`
}

export function createBugLabApp(store = new BugLabStore(), now: () => number = Date.now) {
  const app = express()
  const approvals = new Map<string, DeletionApproval>()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '16kb', strict: true }))
  app.use('/api', loopbackOnly)

  app.get('/health', (_request, response) => response.json({ status: 'ok', app: 'BugLab' }))

  app.get('/api/products', (_request, response) => response.json([product]))
  app.get('/api/cart', (_request, response) => response.json({ ...store.cart, product }))
  app.post('/api/cart/items', (request, response) => {
    const parsed = z.object({ productId: z.literal(product.id) }).strict().safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'invalid_cart_item' })
      return
    }
    const cart = store.addProduct()
    if (cart.tc1Failure) store.appendSafeLog('TC1', "Cart subtotal omits the second item's price.")
    response.status(200).json({ ...cart, product })
  })

  app.get('/api/scenarios', (_request, response) => response.json(scenarios))
  app.get('/api/sandbox/records', (_request, response) => response.json({ stateVersion: store.stateVersion, records: store.records }))

  app.post('/api/sandbox/ui-reset', (_request, response) => {
    store.reset()
    approvals.clear()
    response.json({ reset: true, stateVersion: store.stateVersion, records: store.records, cart: store.cart })
  })

  // ReproProof verifier endpoint. It is loopback-only and can require a test-only
  // bearer secret when BUGLAB_RESET_TOKEN is configured.
  app.post('/api/sandbox/reset', (request, response) => {
    if (!resetAuthorization(request)) {
      response.status(401).json({ error: 'reset_unauthorized' })
      return
    }
    store.reset()
    approvals.clear()
    response.json({ reset: true, stateVersion: store.stateVersion })
  })

  app.post('/api/sandbox/deletion-approvals', (request, response) => {
    const parsed = ApprovalSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'invalid_approval_request' })
      return
    }
    const ids = [...new Set(parsed.data.recordIds)].sort()
    if (ids.length !== parsed.data.recordIds.length) {
      response.status(400).json({ error: 'duplicate_record_ids' })
      return
    }
    const phrase = confirmationPhrase(ids.length)
    if (!constantTimeEqual(parsed.data.confirmation, phrase)) {
      response.status(400).json({ error: 'confirmation_phrase_mismatch', requiredPhrase: phrase })
      return
    }
    const selected = store.records.filter(record => ids.includes(record.id))
    if (selected.length !== ids.length) {
      response.status(409).json({ error: 'sandbox_records_changed' })
      return
    }
    const approval: DeletionApproval = {
      id: randomUUID(),
      recordIds: ids,
      snapshot: digestRecords(selected, store.stateVersion),
      expiresAt: now() + 5 * 60_000,
      approvedAt: new Date(now()).toISOString(),
    }
    approvals.set(approval.id, approval)
    response.status(201).json({ approvalId: approval.id, recordIds: ids, approvedAt: approval.approvedAt, expiresAt: new Date(approval.expiresAt).toISOString() })
  })

  app.post('/api/sandbox/records/delete', (request, response) => {
    const parsed = DeleteSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'invalid_delete_request' })
      return
    }
    const approval = approvals.get(parsed.data.approvalId)
    const requestedIds = [...new Set(parsed.data.recordIds)].sort()
    if (!approval || approval.expiresAt <= now()) {
      approvals.delete(parsed.data.approvalId)
      response.status(403).json({ error: 'deletion_approval_required_or_expired' })
      return
    }
    if (requestedIds.length !== parsed.data.recordIds.length || JSON.stringify(requestedIds) !== JSON.stringify(approval.recordIds)) {
      response.status(409).json({ error: 'approved_record_set_mismatch' })
      return
    }
    const selected = store.records.filter(record => approval.recordIds.includes(record.id))
    if (selected.length !== approval.recordIds.length || digestRecords(selected, store.stateVersion) !== approval.snapshot) {
      approvals.delete(approval.id)
      response.status(409).json({ error: 'approved_sandbox_state_changed' })
      return
    }
    store.records = store.records.filter(record => !approval.recordIds.includes(record.id))
    store.stateVersion += 1
    approvals.delete(approval.id)
    store.appendSafeLog('TC3', `Deleted ${approval.recordIds.length} approved disposable sandbox record(s).`)
    response.json({ deletedIds: approval.recordIds, stateVersion: store.stateVersion, remainingRecords: store.records })
  })

  app.post('/api/scenarios/token', (_request, response) => {
    store.appendSafeLog('TC4', `Synthetic token observed: ${syntheticToken}`)
    response.json({ detected: true, token: syntheticToken, safeMessage: 'Synthetic token fixture loaded; shared log output is redacted.' })
  })
  app.post('/api/test-logs', (request, response) => {
    const parsed = LogInputSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'invalid_log_event' })
      return
    }
    const sanitized = safeLogMessage(parsed.data.message)
    store.appendSafeLog(parsed.data.type, sanitized)
    response.status(201).json({ saved: true, message: sanitized, redacted: sanitized !== parsed.data.message })
  })
  app.get('/api/test-logs', (_request, response) => response.json({ logs: store.safeLogs }))
  app.get('/api/test-logs/export', (_request, response) => {
    response.type('application/json').attachment('buglab-sanitized-logs.json').send(JSON.stringify({ exportedAt: new Date().toISOString(), logs: store.safeLogs }, null, 2))
  })

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    // Never log request bodies. Error text is scrubbed before it reaches stdout.
    if (response.headersSent) {
      next(error)
      return
    }
    const message = safeLogMessage(error instanceof Error ? error.message : 'unknown error')
    console.error(`BugLab request failed: ${message}`)
    response.status(400).json({ error: 'invalid_request' })
  })
  return app
}

export { confirmationPhrase, redactText }
