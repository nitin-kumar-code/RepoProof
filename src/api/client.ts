import { z } from 'zod'
import type { ApiError } from '../types/run'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
const baseUrl = (configuredBaseUrl || (import.meta.env.DEV ? 'http://localhost:4000' : '')).replace(/\/$/, '')

export class ApiRequestError extends Error {
  readonly status: number
  readonly issues: NonNullable<ApiError['issues']>

  constructor(message: string, status: number, issues: NonNullable<ApiError['issues']> = []) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.issues = issues
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit, schema?: z.ZodType<T>): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') throw new Error('The API request timed out. Check the backend and try again.', { cause })
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new Error('The ReproProof API could not be reached. Check the backend connection and try again.', { cause })
  }
  if (!response.ok) {
    let detail = ''
    let issues: NonNullable<ApiError['issues']> = []
    try {
      const body = await response.json() as ApiError
      issues = body.issues ?? []
      const formattedIssues = issues.map(issue => {
        const path = Array.isArray(issue.path) ? issue.path.join('.') : issue.path
        return [path, issue.message].filter(Boolean).join(': ')
      }).filter(Boolean)
      detail = formattedIssues.length ? formattedIssues.join('; ') : body.message || body.error || ''
    } catch {
      // Use the status fallback when the server did not return JSON.
    }
    const messages: Record<number, string> = {
      401: 'Approval credentials were not accepted.',
      403: 'The target or requested action is not permitted by the server configuration.',
      404: 'The requested report, run, or evidence was not found.',
      409: 'This run has changed state. Refresh it and try again if the action is still available.',
      410: 'The approval window has expired.',
      502: 'The plan could not be generated. Review the report and API configuration.',
      503: 'The browser queue is unavailable. Check Supabase and worker configuration.',
    }
    throw new ApiRequestError(detail || messages[response.status] || `Request failed (${response.status})`, response.status, issues)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`The API returned an invalid JSON response (${response.status}).`)
  }
  if (!schema) return body as T
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new Error(`The API returned an unexpected response for ${path}.`)
  return parsed.data
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3500) })
    return response.ok
  } catch {
    return false
  }
}

export { baseUrl }
