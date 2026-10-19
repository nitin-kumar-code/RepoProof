import { describe, expect, it } from 'vitest'
import { redactText, redactValue } from '../src/services/redactor'

describe('evidence redaction', () => {
  it('removes bearer credentials, JWTs, API keys and known configured secrets from text', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_value_12345'
    const input = `Authorization: Bearer test_secret_12345 token=${jwt} api_key=sk-live-abcdefghijklm known-secret-value`
    const output = redactText(input, ['known-secret-value'])
    expect(output).not.toContain('test_secret_12345')
    expect(output).not.toContain(jwt)
    expect(output).not.toContain('sk-live-abcdefghijklm')
    expect(output).not.toContain('known-secret-value')
  })

  it('redacts sensitive header fields and URL query parameters recursively', () => {
    const sanitized = redactValue({
      headers: { Authorization: 'Bearer test_secret_12345', Cookie: 'sid=synthetic_cookie', 'Set-Cookie': 'session=synthetic_cookie' },
      requestUrl: 'https://demo.example/path?access_token=test_secret_12345&view=compact',
      report: { email: 'synthetic@example.test', password: 'test_secret_12345', description: 'Authorization: Bearer test_secret_12345' },
    }, ['test_secret_12345', 'synthetic_cookie'])
    const serialized = JSON.stringify(sanitized)
    expect(serialized).not.toContain('test_secret_12345')
    expect(serialized).not.toContain('synthetic_cookie')
    expect(serialized).not.toContain('synthetic@example.test')
    expect(serialized).toContain('view=compact')
    expect(serialized).toContain('[REDACTED]')
  })

  it('redacts sensitive query parameter variants while preserving ordinary parameters', () => {
    const sanitized = redactValue({
      url: 'https://demo.example/?session_id=s1&client_secret=s2&access_code=s3&user_token=s4&theme=dark',
    }, ['s1', 's2', 's3', 's4'])
    expect(sanitized.url).not.toMatch(/s[1-4]/)
    expect(sanitized.url).toContain('theme=dark')
    expect(sanitized.url).toMatch(/session_id=%5BREDACTED%5D/)
  })
})
