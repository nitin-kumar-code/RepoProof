import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().url().optional(),
  // Exact hostnames, comma-separated. An empty allowlist rejects all target URLs.
  ALLOWED_TARGET_HOSTS: z.string().default('').transform(value =>
    value.split(',').map(host => host.trim().toLowerCase()).filter(Boolean),
  ),
  // Default to common local web app ports; add other ports deliberately.
  ALLOWED_TARGET_PORTS: z.string().default('80,443,3000,4000,4173,5000,5173,8000,8080,8081,8443').transform(value =>
    value.split(',').map(port => port.trim()).filter(Boolean).map(Number),
  ),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PLANNER_MODE: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.preprocess(value => value === '' ? undefined : value, z.string().min(1).optional()),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-4o-mini'),
  APPROVAL_USERNAME: z.preprocess(value => value === '' ? undefined : value, z.string().trim().min(1).refine(value => !value.includes(':'), 'must not contain a colon').optional()),
  APPROVAL_PASSWORD: z.preprocess(value => value === '' ? undefined : value, z.string().min(12).optional()),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`)
}

export const env = parsed.data

if (Boolean(env.SUPABASE_URL) !== Boolean(env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error('Invalid environment configuration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together')
}

if (env.PLANNER_MODE === 'openai' && !env.OPENAI_API_KEY) {
  throw new Error('Invalid environment configuration: OPENAI_API_KEY is required when PLANNER_MODE=openai')
}

if (Boolean(env.APPROVAL_USERNAME) !== Boolean(env.APPROVAL_PASSWORD)) {
  throw new Error('Invalid environment configuration: APPROVAL_USERNAME and APPROVAL_PASSWORD must be configured together')
}

for (const host of env.ALLOWED_TARGET_HOSTS) {
  if (host.includes('/') || host.includes(':') || host.includes('@') || host.includes('*')) {
    throw new Error(`Invalid ALLOWED_TARGET_HOSTS entry "${host}": use exact hostnames without ports or wildcards`)
  }
}

for (const port of env.ALLOWED_TARGET_PORTS) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ALLOWED_TARGET_PORTS entry "${port}": use comma-separated ports from 1 to 65535`)
  }
}
