const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '')

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json() as {
        message?: string
        error?: string
        issues?: Array<{ path?: string | string[]; message?: string }>
      }
      const issues = body.issues?.map(issue => {
        const path = Array.isArray(issue.path) ? issue.path.join('.') : issue.path
        return [path, issue.message].filter(Boolean).join(': ')
      }).filter(Boolean)
      detail = issues?.length ? issues.join('; ') : body.message || body.error || ''
    } catch {
      // Use the status fallback when the server did not return JSON.
    }
    throw new Error(detail || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
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
