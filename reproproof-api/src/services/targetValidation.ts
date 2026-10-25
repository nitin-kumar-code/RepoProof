import { type LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { Page } from 'playwright'
import { env, isDevelopmentLocalHost } from '../config/env'

export class TargetValidationError extends Error {
  constructor(readonly code: 'target_not_allowed' | 'target_not_https' | 'target_private_or_unresolved' | 'request_origin_not_allowed') {
    super(code)
  }
}

const ipv4NonPublicRanges: Array<[number, number]> = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
  [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
  [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
  [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
]
const dnsCacheTtlMs = 60_000

interface DnsCacheContext {
  entries: Map<string, { expiresAt: number }>
  inFlight: Map<string, Promise<void>>
}

function isLocalDevelopmentAllowed(hostname: string): boolean {
  return env.APP_ENV === 'development' && env.ALLOW_INSECURE_LOCAL_TARGETS && isDevelopmentLocalHost(hostname)
}

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((result, octet) => ((result << 8) | Number(octet)) >>> 0, 0)
}

function inIpv4Range(address: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (address & mask) === (network & mask)
}

function parseIpv6(address: string): bigint | undefined {
  let input = address.toLowerCase().split('%')[0]
  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':')
    const ipv4 = input.slice(lastColon + 1)
    if (isIP(ipv4) !== 4) return undefined
    const value = ipv4ToNumber(ipv4)
    input = `${input.slice(0, lastColon)}:${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`
  }
  const halves = input.split('::')
  if (halves.length > 2) return undefined
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const zeroCount = halves.length === 2 ? 8 - left.length - right.length : 0
  const groups = [...left, ...Array.from({ length: zeroCount }, () => '0'), ...right]
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return undefined
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n)
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    const numeric = ipv4ToNumber(address)
    return !ipv4NonPublicRanges.some(([network, prefix]) => inIpv4Range(numeric, network, prefix))
  }
  if (version === 6) {
    const numeric = parseIpv6(address)
    if (numeric === undefined) return false
    // Restrict IPv6 to global unicast (2000::/3), excluding protocol and
    // documentation allocations that are not ordinary public destinations.
    const globalUnicast = (numeric >> 125n) === 1n
    const first32 = numeric >> 96n
    const first16 = numeric >> 112n
    const first20 = numeric >> 108n
    return globalUnicast && first32 !== 0x20010db8n
      && (numeric >> 105n) !== 0x200100n
      && first16 !== 0x2002n
      && first20 !== 0x3fff0n
  }
  return false
}

function allowedOrigins(): string[] {
  return [...new Set([...env.ALLOWED_TARGET_ORIGINS, ...env.ALLOWED_RESOURCE_ORIGINS].map(origin => new URL(origin).origin))]
}

function parseAllowedOriginUrl(value: string, allowed: string[]): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TargetValidationError('target_not_allowed')
  }
  const insecureLocal = isLocalDevelopmentAllowed(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && insecureLocal)) {
    throw new TargetValidationError('target_not_https')
  }
  if (url.username || url.password || !allowed.includes(url.origin)) {
    throw new TargetValidationError('request_origin_not_allowed')
  }
  return url
}

async function assertPublicResolution(hostname: string, cache?: DnsCacheContext): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (isLocalDevelopmentAllowed(host)) return
  const version = isIP(host)
  if (version) {
    if (!isPublicAddress(host)) throw new TargetValidationError('target_private_or_unresolved')
    return
  }
  if (isDevelopmentLocalHost(host) || host.endsWith('.example')) {
    throw new TargetValidationError('target_private_or_unresolved')
  }
  const cached = cache?.entries.get(host)
  if (cached && cached.expiresAt > Date.now()) return
  if (cached) cache?.entries.delete(host)

  let lookupPromise = cache?.inFlight.get(host)
  if (!lookupPromise) {
    lookupPromise = (async () => {
      let addresses: LookupAddress[]
      try {
        addresses = await lookup(host, { all: true, verbatim: true })
      } catch {
        throw new TargetValidationError('target_private_or_unresolved')
      }
      if (addresses.length === 0 || addresses.some(entry => !isPublicAddress(entry.address))) {
        throw new TargetValidationError('target_private_or_unresolved')
      }
      cache?.entries.set(host, { expiresAt: Date.now() + dnsCacheTtlMs })
    })()
    cache?.inFlight.set(host, lookupPromise)
  }
  try {
    await lookupPromise
  } finally {
    if (cache?.inFlight.get(host) === lookupPromise) cache.inFlight.delete(host)
  }
}

export async function validateTargetUrl(value: string): Promise<URL> {
  const url = parseAllowedOriginUrl(value, env.ALLOWED_TARGET_ORIGINS.map(origin => new URL(origin).origin))
  await assertPublicResolution(url.hostname)
  return url
}

export async function assertAllowedResourceUrl(value: string, isNavigation = false, cache?: DnsCacheContext): Promise<void> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TargetValidationError('request_origin_not_allowed')
  }
  if (!isNavigation && url.protocol === 'data:') {
    if (/^data:(?:image|font|audio|video)\//i.test(value)
      || /^data:application\/(?:font-[^;,]+|vnd\.ms-fontobject)(?:[;,]|$)/i.test(value)) return
    throw new TargetValidationError('request_origin_not_allowed')
  }
  if (!isNavigation && url.protocol === 'blob:') {
    if (allowedOrigins().includes(url.origin)) return
    throw new TargetValidationError('request_origin_not_allowed')
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalDevelopmentAllowed(url.hostname))) {
    throw new TargetValidationError('target_not_https')
  }
  if (url.username || url.password || !allowedOrigins().includes(url.origin)) {
    throw new TargetValidationError('request_origin_not_allowed')
  }
  await assertPublicResolution(url.hostname, cache)
}

/** Install before any page navigation. Every HTTP(S) request, including redirects, is checked. */
export async function installApprovedRequestGuard(page: Page, requestAuthorization?: { origin: string; header: string }): Promise<void> {
  const cache: DnsCacheContext = { entries: new Map(), inFlight: new Map() }
  await page.route('**/*', async route => {
    try {
      const requestUrl = route.request().url()
      await assertAllowedResourceUrl(requestUrl, route.request().isNavigationRequest(), cache)
      if (requestAuthorization && new URL(requestUrl).origin === requestAuthorization.origin) {
        const headers = { ...route.request().headers() }
        for (const key of Object.keys(headers)) if (key.toLowerCase() === 'authorization') delete headers[key]
        headers.authorization = requestAuthorization.header
        await route.continue({ headers })
      } else {
        await route.continue()
      }
    } catch {
      await route.abort('blockedbyclient')
    }
  })
}
