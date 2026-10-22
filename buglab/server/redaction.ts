import { syntheticToken } from '../shared/data.js'

export { syntheticToken }
const redacted = '[REDACTED]'

export function redactText(input: string): string {
  return input
    .replace(/\bAuthorization\s*:\s*Bearer\s+[^\s,;"']+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/\bBearer\s+[^\s,;"']+/gi, `Bearer ${redacted}`)
    .replace(/\b((?:access|refresh|id)?_?token|api[_-]?key|client_secret|secret)\s*([=:])\s*[^\s&,;]+/gi, `$1$2${redacted}`)
    .replace(/TEST_TOKEN_DO_NOT_USE_[A-Za-z0-9_-]+/g, '[REDACTED_SYNTHETIC_TOKEN]')
}

export function safeLogMessage(input: string): string {
  return redactText(input).slice(0, 1000)
}
