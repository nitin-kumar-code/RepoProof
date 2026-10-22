export const product = {
  id: 'alpine-trail-backpack',
  name: 'Alpine Trail Backpack',
  description: 'A durable 28L day pack for synthetic demo orders.',
  priceCents: 6400,
  image: '🎒',
}

export const syntheticToken = 'TEST_TOKEN_DO_NOT_USE_1234567890'

export interface SandboxRecord {
  id: string
  name: string
  kind: 'test-order' | 'test-customer' | 'test-cart'
  createdAt: string
}

export interface CartState {
  productId: string
  quantity: number
  unitPriceCents: number
  subtotalCents: number
  expectedSubtotalCents: number
  tc1Failure: boolean
  fingerprint: string | null
}

export function emptyCart(): CartState {
  return {
    productId: product.id,
    quantity: 0,
    unitPriceCents: product.priceCents,
    subtotalCents: 0,
    expectedSubtotalCents: 0,
    tc1Failure: false,
    fingerprint: null,
  }
}
