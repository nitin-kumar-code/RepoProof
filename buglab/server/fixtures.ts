import { createHash } from 'node:crypto'
import { safeLogMessage } from './redaction.js'
import { emptyCart, product, type CartState, type SandboxRecord } from '../shared/data.js'

const seedRecords: SandboxRecord[] = [
  { id: 'sandbox-order-001', name: 'Disposable order RP-1001', kind: 'test-order', createdAt: '2026-01-15T12:00:00.000Z' },
  { id: 'sandbox-customer-001', name: 'Synthetic customer Avery Demo', kind: 'test-customer', createdAt: '2026-01-15T12:00:00.000Z' },
  { id: 'sandbox-cart-001', name: 'Disposable cart RP-CART-01', kind: 'test-cart', createdAt: '2026-01-15T12:00:00.000Z' },
]

export class BugLabStore {
  records: SandboxRecord[] = []
  stateVersion = 0
  cart: CartState = emptyCart()
  safeLogs: Array<{ type: string; message: string; createdAt: string }> = []

  constructor() { this.reset() }

  reset(): void {
    this.records = seedRecords.map(record => ({ ...record }))
    this.cart = emptyCart()
    this.safeLogs = []
    this.stateVersion += 1
  }

  addProduct(): CartState {
    this.cart.quantity += 1
    this.cart.expectedSubtotalCents = this.cart.quantity * product.priceCents
    // Deliberate TC1 defect: quantity updates, but the subtotal is stale after the
    // second addition. It is deterministic and scoped to this synthetic fixture.
    this.cart.subtotalCents = this.cart.quantity === 1 ? product.priceCents : product.priceCents
    this.cart.tc1Failure = this.cart.quantity >= 2 && this.cart.subtotalCents !== this.cart.expectedSubtotalCents
    this.cart.fingerprint = this.cart.tc1Failure
      ? createHash('sha256').update(`TC1|${product.id}|quantity=2|subtotal=${product.priceCents}|expected=${product.priceCents * 2}`).digest('hex')
      : null
    return { ...this.cart }
  }

  appendSafeLog(type: string, message: string): void {
    this.safeLogs.unshift({ type, message: safeLogMessage(message), createdAt: '2026-01-15T12:00:00.000Z' })
    this.safeLogs = this.safeLogs.slice(0, 50)
  }
}

export function seededRecords(): SandboxRecord[] {
  return seedRecords.map(record => ({ ...record }))
}
