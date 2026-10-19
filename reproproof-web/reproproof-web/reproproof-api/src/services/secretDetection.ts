const credentialAssignment = /\b(?:password|passwd|passcode|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization|cookie)\b\s*[:=]\s*["']?[^\s"'&,;]+/i
const bearerCredential = /\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}/i
const knownSecretFormat = /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/
const sensitiveQueryKey = /(?:password|passwd|secret|token|api[_-]?key|authorization|session)/i

export function containsCredentialMaterial(values: string[]): boolean {
  if (values.some(value => credentialAssignment.test(value) || bearerCredential.test(value) || knownSecretFormat.test(value))) {
    return true
  }
  for (const value of values) {
    try {
      const url = new URL(value)
      if ([...url.searchParams.keys()].some(key => sensitiveQueryKey.test(key))) return true
    } catch {
      // Non-URL text is checked by the credential patterns above.
    }
  }
  return false
}
