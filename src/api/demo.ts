import { z } from 'zod'
import { apiRequest } from './client'

const bugLabConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().url().nullable(),
  scenarios: z.array(z.enum(['TC1', 'TC2', 'TC3', 'TC4'])),
}).strict()

export type BugLabConfig = z.infer<typeof bugLabConfigSchema>

export function getBugLabConfig(signal?: AbortSignal): Promise<BugLabConfig> {
  return apiRequest('/api/demo/buglab', { signal }, bugLabConfigSchema)
}
