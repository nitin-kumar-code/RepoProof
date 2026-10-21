import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBugs } from '../../src/api/bugs'
import { apiRequest } from '../../src/api/client'

afterEach(() => vi.unstubAllGlobals())

describe('frontend API client', () => {
  it('decodes JSON through the report runtime schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 'bug-1', title: 'Profile save fails', description: 'Save returns an error',
      steps: [{ order: 1, instruction: 'Click Save' }], expectedBehavior: 'Saved', actualBehavior: 'Error',
      environment: { targetUrl: 'https://demo.example/', browser: 'chromium' }, createdAt: '2026-10-20T00:00:00.000Z',
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(getBugs()).resolves.toHaveLength(1)
  })

  it('shows useful server errors and rejects malformed successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'target_not_allowed', message: 'Host is not allowlisted' }), { status: 403 })))
    await expect(apiRequest('/api/bugs')).rejects.toThrow('Host is not allowlisted')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{broken', { status: 200 })))
    await expect(apiRequest('/api/bugs')).rejects.toThrow('invalid JSON response')
  })

  it('reports connection failures without exposing internal browser errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('socket details')))
    await expect(apiRequest('/api/bugs')).rejects.toThrow('The ReproProof API could not be reached')
  })
})
