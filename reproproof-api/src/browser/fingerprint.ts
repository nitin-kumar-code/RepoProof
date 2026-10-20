import { createHash } from 'node:crypto'
import { redactText } from '../services/redactor'

export type FingerprintFailureType = 'visible_text' | 'console_error' | 'page_error' | 'request_failed' | 'http_failure'

export interface FailureFingerprintInput {
  route: string
  criterionId: string
  failureType: FingerprintFailureType
  message: string
  request?: { method: string; path: string; status: number | null } | null
}

export interface FailureFingerprint extends FailureFingerprintInput {
  hash: string
  request: { method: string; path: string; status: number | null } | null
}

function normalize(value: string): string {
  return redactText(value)
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.Z+-]+\b/g, '<timestamp>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<uuid>')
    .replace(/\b(?:request|trace|correlation)[-_ ]?id\s*[:= ]\s*[A-Za-z0-9_-]+/gi, 'request-id=<id>')
    .replace(/\b\d{10,}\b/g, '<number>')
    .replace(/[\r\n\t ]+/g, ' ')
    .trim()
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function normalizeRoute(route: string): string {
  const pathname = route.split('?')[0] || '/'
  return pathname
    .split('/')
    .map(segment => (/^[0-9a-f-]{16,}$/i.test(segment) || /^\d{4,}$/.test(segment) ? ':id' : normalize(segment)))
    .join('/')
}

export function createFailureFingerprint(input: FailureFingerprintInput): FailureFingerprint {
  const normalized = {
    route: normalizeRoute(input.route),
    criterionId: normalize(input.criterionId).slice(0, 100),
    failureType: input.failureType,
    message: normalize(input.message).slice(0, 1000),
    request: input.request ? {
      method: input.request.method.toUpperCase().slice(0, 20),
      path: normalizeRoute(input.request.path),
      status: input.request.status,
    } : null,
  }
  return { ...normalized, hash: createHash('sha256').update(stableJson(normalized)).digest('hex') }
}

