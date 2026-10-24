import { env } from '../config/env'

const redacted = '[REDACTED]'
const sensitiveKey = /(?:authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|password|passwd|passcode|credential|private[-_]?key|client[-_]?secret|session[-_]?key|email|phone|address|signature|username)/i
const sensitiveQuery = /(?:token|auth|key|secret|password|passwd|session|code|signature|sig|cred)/i

function configuredSecrets(): string[] {
  const configured = Object.entries(process.env)
    .filter(([name]) => /(?:PASSWORD|PASSWD|TOKEN|SECRET|API_KEY|CREDENTIAL|COOKIE)$/i.test(name))
    .map(([, value]) => value)
  return [env.OPENAI_API_KEY, env.SUPABASE_SERVICE_ROLE_KEY, env.APPROVAL_PASSWORD, ...configured]
    .filter((value): value is string => Boolean(value && value.length >= 4))
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.username || url.password) {
      url.username = redacted
      url.password = redacted
    }
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveQuery.test(key)) url.searchParams.set(key, redacted)
    }
    return url.toString()
  } catch {
    return value
  }
}

export function redactText(input: string, knownSecrets: string[] = []): string {
  let value = input
  for (const secret of [...configuredSecrets(), ...knownSecrets].filter(secret => secret.length >= 4)) {
    value = value.split(secret).join(redacted)
  }
  value = value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${redacted}`)
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, redacted)
    .replace(/\b(?:sk|rk|pk|api)[-_](?:live[-_])?[A-Za-z0-9_-]{8,}\b/gi, redacted)
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, redacted)
    .replace(/((?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)\s*[:=]\s*)[^\s,;]+/gi, `$1${redacted}`)
    .replace(/https?:\/\/[^\s"'<>]+/gi, match => redactUrl(match))
  return value
}

/** Recursively sanitize telemetry and report payloads before persistence or export. */
export function redactValue<T>(input: T, knownSecrets: string[] = []): T {
  const seen = new WeakSet<object>()
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') return redactText(value, knownSecrets)
    if (Array.isArray(value)) return value.map(visit)
    if (value && typeof value === 'object') {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
      const output: Record<string, unknown> = {}
      for (const [key, nested] of Object.entries(value)) {
        output[key] = sensitiveKey.test(key) ? redacted : visit(nested)
      }
      return output
    }
    return value
  }
  return visit(input) as T
}
