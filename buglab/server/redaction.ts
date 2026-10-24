import { syntheticToken } from '../shared/data.js'

export { syntheticToken }
const redacted = '[REDACTED]'

export function redactText(input: string): string {
  const sanitized = input
    .replace(/\b(?:Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]*/gi, header => `${header.slice(0, header.indexOf(':'))}: [REDACTED]`)
    .replace(/\bBearer\s+[^\s,;"']+/gi, `Bearer ${redacted}`)
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, redacted)
    .replace(/\b(?:sk|pk|api)[_-][A-Za-z0-9_-]{16,}\b/gi, redacted)
    .replace(/\b([A-Za-z0-9_-]*(?:token|key|secret|password|passwd|session|auth|signature|sig|code|credential|cookie)[A-Za-z0-9_-]*)\s*([=:])\s*[^\s&,;]+/gi, `$1$2${redacted}`)
    .replace(/TEST_TOKEN_DO_NOT_USE_[A-Za-z0-9_-]+/g, '[REDACTED_SYNTHETIC_TOKEN]')
  const configuredSecrets = Object.entries(process.env)
    .filter(([name, value]) => /(?:secret|token|password|key|credential)/i.test(name) && Boolean(value) && value!.length >= 4)
    .map(([, value]) => value!)
    .sort((a, b) => b.length - a.length)
  return configuredSecrets.reduce((text, secret) => text.split(secret).join(redacted), sanitized)
}

export function safeLogMessage(input: string): string {
  return redactText(input).slice(0, 1000)
}
