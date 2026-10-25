import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import express, { type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { BugLabStore, seededRecords } from './fixtures.js'
import { product, type SandboxRecord } from '../shared/data.js'
import { redactText, safeLogMessage, syntheticToken } from './redaction.js'
import { scenarios } from '../shared/scenarios.js'

const DELETION_ACTION = 'delete_records' as const
const RESET_TOKEN_PLACEHOLDER = 'replace-with-a-random-secret'
const RecordIdsSchema = z.object({ recordIds: z.array(z.string().regex(/^sandbox-[a-z]+-\d{3}$/)).min(1).max(20) }).strict()
const ApprovalSchema = RecordIdsSchema.extend({ confirmation: z.string().min(1).max(100), planVersion: z.number().int().positive() }).strict()
const DeleteSchema = RecordIdsSchema.extend({
  approvalId: z.string().uuid(),
  action: z.literal(DELETION_ACTION),
  planVersion: z.number().int().positive(),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
const LogInputSchema = z.object({ type: z.string().trim().min(1).max(50), message: z.string().max(5000) }).strict()
const UiResetSchema = z.object({}).strict()
const VerifierResetSchema = z.object({ runId: z.string().trim().min(1).max(200), bugReportId: z.string().trim().min(1).max(200) }).strict()

interface DeletionApproval {
  id: string
  action: typeof DELETION_ACTION
  recordIds: string[]
  planVersion: number
  planHash: string
  targetDigest: string
  approver: string
  expiresAt: number
  approvedAt: string
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

function resetAuthorization(request: Request, expected: string | undefined): boolean {
  if (!expected) return false
  const header = request.header('authorization') ?? ''
  return header.startsWith('Bearer ') && constantTimeEqual(header.slice(7), expected)
}

function planDigest(action: typeof DELETION_ACTION, recordIds: string[], planVersion: number, targetDigest: string): string {
  return createHash('sha256').update(JSON.stringify({ action, recordIds, planVersion, targetDigest })).digest('hex')
}

function confirmationPhrase(count: number): string {
  return `DELETE ${count} SANDBOX RECORD${count === 1 ? '' : 'S'}`
}

function configuredUiOrigins(values: string[]): Set<string> {
  const origins = new Set<string>()
  for (const value of values) {
    try {
      const url = new URL(value)
      if (['http:', 'https:'].includes(url.protocol) && url.origin === value
        && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origins.add(url.origin)
    } catch {
      // Ignore malformed entries. Destructive browser routes fail closed if no valid origin remains.
    }
  }
  return origins
}

export interface BugLabAppOptions {
  resetToken?: string
  allowedUiOrigins?: string[]
  approvalUsername?: string
  approvalPassword?: string
}

export function createBugLabApp(
  store = new BugLabStore(),
  now: () => number = Date.now,
  options: BugLabAppOptions = {},
) {
  const app = express()
  const approvals = new Map<string, DeletionApproval>()
  const resetToken = options.resetToken ?? process.env.BUGLAB_RESET_TOKEN
  const approvalUsername = options.approvalUsername ?? process.env.BUGLAB_APPROVAL_USERNAME
  const approvalPassword = options.approvalPassword ?? process.env.BUGLAB_APPROVAL_PASSWORD
  const resetTokenConfigured = Boolean(resetToken && resetToken.length >= 32 && resetToken !== RESET_TOKEN_PLACEHOLDER)
  const allowedUiOrigins = configuredUiOrigins(options.allowedUiOrigins ?? (process.env.BUGLAB_UI_ORIGINS || 'http://127.0.0.1:4173,http://localhost:4173').split(',').map(origin => origin.trim()).filter(Boolean))
  app.disable('x-powered-by')
  app.use(express.json({ limit: '16kb', strict: true }))
  app.use('/api', (request, response, next) => {
    const origin = request.header('origin')
    if (origin && allowedUiOrigins.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }
    if (request.method === 'OPTIONS') {
      response.status(origin && allowedUiOrigins.has(origin) ? 204 : 403).end()
      return
    }
    next()
  })

  function verifiedApprover(request: Request): string | undefined {
    const header = request.header('authorization') ?? ''
    if (!approvalUsername || !approvalPassword || !header.startsWith('Basic ')) return undefined
    let supplied: string
    try { supplied = Buffer.from(header.slice(6), 'base64').toString('utf8') } catch { return undefined }
    const separator = supplied.indexOf(':')
    if (separator < 0) return undefined
    const username = supplied.slice(0, separator)
    const password = supplied.slice(separator + 1)
    return constantTimeEqual(username, approvalUsername) && constantTimeEqual(password, approvalPassword)
      ? approvalUsername
      : undefined
  }

  function requireApprover(request: Request, response: Response): string | undefined {
    const approver = verifiedApprover(request)
    if (!approver) {
      response.setHeader('WWW-Authenticate', 'Basic realm="BugLab destructive approval", charset="UTF-8"')
      response.status(401).json({ error: 'approval_credentials_required' })
      return undefined
    }
    return approver
  }

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

  app.post('/api/sandbox/ui-reset', (request, response) => {
    const origin = request.header('origin')
    const fetchSite = request.header('sec-fetch-site')
    if (!origin || !allowedUiOrigins.has(origin) || (fetchSite && fetchSite !== 'same-origin')) {
      response.status(403).json({ error: 'same_origin_required' })
      return
    }
    if (!UiResetSchema.safeParse(request.body).success) {
      response.status(400).json({ error: 'invalid_reset_request' })
      return
    }
    store.reset()
    approvals.clear()
    response.json({ reset: true, stateVersion: store.stateVersion, records: store.records, cart: store.cart })
  })

  // ReproProof verifier endpoint. It is loopback-only and requires a test-only
  // bearer secret. Without one, reset is disabled.
  app.post('/api/sandbox/reset', (request, response) => {
    if (!resetTokenConfigured || !resetToken) {
      response.status(503).json({ error: 'reset_token_not_configured' })
      return
    }
    if (!resetAuthorization(request, resetToken)) {
      response.status(401).json({ error: 'reset_unauthorized' })
      return
    }
    if (!VerifierResetSchema.safeParse(request.body).success) {
      response.status(400).json({ error: 'invalid_reset_request' })
      return
    }
    store.reset()
    approvals.clear()
    response.json({ reset: true, stateVersion: store.stateVersion })
  })

  app.post('/api/sandbox/deletion-approvals', (request, response) => {
    const approver = requireApprover(request, response)
    if (!approver) return
    const origin = request.header('origin')
    const fetchSite = request.header('sec-fetch-site')
    if (!origin || !allowedUiOrigins.has(origin) || (fetchSite && fetchSite !== 'same-origin')) {
      response.status(403).json({ error: 'same_origin_required' })
      return
    }
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
    if (parsed.data.planVersion !== store.stateVersion) {
      response.status(409).json({ error: 'sandbox_state_changed' })
      return
    }
    const phrase = confirmationPhrase(ids.length)
    if (!constantTimeEqual(parsed.data.confirmation, phrase)) {
      response.status(400).json({ error: 'confirmation_phrase_mismatch', requiredPhrase: phrase })
      return
    }
    const selected = store.records.filter(record => ids.includes(record.id))
    const knownSeedRecords = new Map(seededRecords().map(record => [record.id, JSON.stringify(record)]))
    if (selected.length !== ids.length || selected.some(record => knownSeedRecords.get(record.id) !== JSON.stringify(record))) {
      response.status(409).json({ error: 'sandbox_records_changed' })
      return
    }
    const targetDigest = digestRecords(selected, store.stateVersion)
    const planHash = planDigest(DELETION_ACTION, ids, store.stateVersion, targetDigest)
    const approval: DeletionApproval = {
      id: randomUUID(),
      action: DELETION_ACTION,
      recordIds: ids,
      planVersion: store.stateVersion,
      planHash,
      targetDigest,
      approver,
      expiresAt: now() + 5 * 60_000,
      approvedAt: new Date(now()).toISOString(),
    }
    approvals.set(approval.id, approval)
    response.status(201).json({ approvalId: approval.id, action: approval.action, approver: approval.approver, recordIds: ids, planVersion: approval.planVersion, planHash: approval.planHash, approvedAt: approval.approvedAt, expiresAt: new Date(approval.expiresAt).toISOString() })
  })

  app.post('/api/sandbox/records/delete', (request, response) => {
    const approver = requireApprover(request, response)
    if (!approver) return
    const origin = request.header('origin')
    const fetchSite = request.header('sec-fetch-site')
    if (!origin || !allowedUiOrigins.has(origin) || (fetchSite && fetchSite !== 'same-origin')) {
      response.status(403).json({ error: 'same_origin_required' })
      return
    }
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
    if (parsed.data.action !== approval.action || parsed.data.planVersion !== approval.planVersion || parsed.data.planHash !== approval.planHash) {
      response.status(409).json({ error: 'approved_plan_mismatch' })
      return
    }
    const selected = store.records.filter(record => approval.recordIds.includes(record.id))
    const knownSeedRecords = new Map(seededRecords().map(record => [record.id, JSON.stringify(record)]))
    const targetDigest = digestRecords(selected, store.stateVersion)
    if (selected.length !== approval.recordIds.length || selected.some(record => knownSeedRecords.get(record.id) !== JSON.stringify(record)) || store.stateVersion !== approval.planVersion || targetDigest !== approval.targetDigest || planDigest(approval.action, approval.recordIds, store.stateVersion, targetDigest) !== approval.planHash) {
      approvals.delete(approval.id)
      response.status(409).json({ error: 'approved_sandbox_state_changed' })
      return
    }
    store.records = store.records.filter(record => !approval.recordIds.includes(record.id))
    store.stateVersion += 1
    // The mutation changes the sandbox snapshot. Invalidate every outstanding
    // approval, including approvals for different records from the old version.
    approvals.clear()
    store.appendSafeLog('TC3', `Deleted ${approval.recordIds.length} approved disposable sandbox record(s).`)
    response.json({ deletedIds: approval.recordIds, stateVersion: store.stateVersion, remainingRecords: store.records })
  })

  app.post('/api/scenarios/token', (_request, response) => {
    store.appendSafeLog('TC4', `Synthetic token observed: ${syntheticToken}`)
    response.json({ detected: true, safeMessage: 'Synthetic token fixture loaded; shared log output is redacted.' })
  })
  app.post('/api/test-logs', (request, response) => {
    const parsed = LogInputSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'invalid_log_event' })
      return
    }
    const sanitized = safeLogMessage(parsed.data.message)
    const sanitizedType = safeLogMessage(parsed.data.type)
    store.appendSafeLog(sanitizedType, sanitized)
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
