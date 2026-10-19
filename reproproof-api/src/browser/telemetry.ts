import type { Page, Request } from 'playwright'
import type { z } from 'zod'
import { TelemetryEventSchema } from '../schemas/run'

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>
const maxEvents = 500

function safeText(value: string, maxLength = 2000): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted key]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/https?:\/\/[^\s"'<>]+/gi, url => sanitizeTelemetryUrl(url))
    .slice(0, maxLength)
}

export function sanitizeTelemetryUrl(value: string): string {
  try {
    const url = new URL(value)
    const safePath = url.pathname.split('/').map(segment => {
      if (segment.length > 100 || /^[A-Za-z0-9_-]{32,}$/.test(segment) || /^[^/\s@]+@[^/\s@]+\.[^/\s@]+$/.test(segment)) {
        return '[redacted]'
      }
      return segment
    }).join('/')
    const query = [...url.searchParams.keys()].map(key => `${encodeURIComponent(key)}=[redacted]`).join('&')
    return `${url.origin}${safePath}${query ? `?${query}` : ''}`.slice(0, 2000)
  } catch {
    return '[invalid URL]'
  }
}

function requestDetails(request: Request): Pick<TelemetryEvent, 'method' | 'url'> {
  return { method: request.method().slice(0, 20), url: sanitizeTelemetryUrl(request.url()) }
}

export class BrowserTelemetry {
  readonly events: TelemetryEvent[] = []

  attach(page: Page): void {
    page.on('console', message => {
      if (message.type() !== 'error') return
      this.push({ type: 'console_error', timestamp: new Date().toISOString(), severity: message.type(), message: safeText(message.text()) })
    })
    page.on('pageerror', error => {
      this.push({ type: 'page_error', timestamp: new Date().toISOString(), severity: 'uncaught', message: safeText(error.stack ?? error.message) })
    })
    page.on('requestfailed', request => {
      this.push({ type: 'request_failed', timestamp: new Date().toISOString(), ...requestDetails(request), failure: safeText(request.failure()?.errorText ?? 'request failed', 500) })
    })
    page.on('response', response => {
      if (response.status() < 400) return
      this.push({ type: 'http_failure', timestamp: new Date().toISOString(), ...requestDetails(response.request()), status: response.status() })
    })
  }

  private push(event: TelemetryEvent): void {
    if (this.events.length < maxEvents) this.events.push(event)
  }

}

export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  return safeText(message)
}


