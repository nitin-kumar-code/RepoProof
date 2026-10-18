const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '')

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
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
