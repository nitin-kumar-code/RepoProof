import 'dotenv/config'
import { isIP } from 'node:net'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().url().refine(value => new URL(value).origin === value, 'must be an exact origin without a path').optional(),
  // Exact HTTPS origins, comma-separated. An empty allowlist rejects targets.
  ALLOWED_TARGET_ORIGINS: z.string().default('').transform(value =>
    value.split(',').map(origin => origin.trim()).filter(Boolean),
  ),
  // Additional origins for required APIs/static assets, also exact HTTPS origins.
  ALLOWED_RESOURCE_ORIGINS: z.string().default('').transform(value =>
    value.split(',').map(origin => origin.trim()).filter(Boolean),
  ),
  BUGLAB_BASE_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()),
  BUGLAB_API_BASE_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()),
  ALLOW_INSECURE_LOCAL_TARGETS: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  RUN_ARTIFACTS_DIR: z.string().trim().min(1).default('artifacts/runs'),
  EVIDENCE_STORAGE_BUCKET: z.string().trim().min(1).default('reproproof-evidence'),
  VERIFICATION_RESET_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()),
  VERIFICATION_RESET_TOKEN: z.preprocess(value => value === '' ? undefined : value, z.string().min(1).optional()),
  SUPABASE_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(value => value === '' ? undefined : value, z.string().min(1).optional()),
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

export function isDevelopmentLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.endsWith('.internal') || host.endsWith('.test') || !host.includes('.')) return true
  if (isIP(host) === 4) {
    const octets = host.split('.').map(Number)
    return octets[0] === 10 || octets[0] === 127
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)
  }
  if (isIP(host) === 6) {
    const address = host.toLowerCase()
    return address === '::1' || address.startsWith('fc') || address.startsWith('fd')
  }
  return false
}

function validateOrigins(origins: string[], name: string): void {
  for (const value of origins) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error(`Invalid ${name} entry "${value}": use an exact HTTPS origin`)
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const localDevelopmentOrigin = env.APP_ENV === 'development' && env.ALLOW_INSECURE_LOCAL_TARGETS && isDevelopmentLocalHost(hostname)
    const allowedProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && localDevelopmentOrigin)
    const publicHostname = !isDevelopmentLocalHost(hostname) && !hostname.endsWith('.example') && isIP(hostname) === 0
    if (!allowedProtocol || (!localDevelopmentOrigin && !publicHostname) || url.origin !== value.replace(/\/$/, '')
      || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new Error(`Invalid ${name} entry "${value}": use an exact HTTPS public origin, or an explicitly enabled development-only local origin, without a path, credentials, query, or fragment`)
    }
  }
}

if (env.ALLOW_INSECURE_LOCAL_TARGETS && env.APP_ENV !== 'development') {
  throw new Error('Invalid environment configuration: ALLOW_INSECURE_LOCAL_TARGETS is permitted only when APP_ENV=development')
}

validateOrigins(env.ALLOWED_TARGET_ORIGINS, 'ALLOWED_TARGET_ORIGINS')
validateOrigins(env.ALLOWED_RESOURCE_ORIGINS, 'ALLOWED_RESOURCE_ORIGINS')

if (env.BUGLAB_BASE_URL) {
  const demo = new URL(env.BUGLAB_BASE_URL)
  const configuredOrigin = demo.origin
  const localDemo = env.APP_ENV === 'development' && env.ALLOW_INSECURE_LOCAL_TARGETS && isDevelopmentLocalHost(demo.hostname)
  if (demo.pathname !== '/' || demo.search || demo.hash || demo.username || demo.password
    || (demo.protocol !== 'https:' && !(demo.protocol === 'http:' && localDemo))
    || !env.ALLOWED_TARGET_ORIGINS.some(origin => new URL(origin).origin === configuredOrigin)) {
    throw new Error('Invalid environment configuration: BUGLAB_BASE_URL must be an exact origin already present in ALLOWED_TARGET_ORIGINS')
  }
}

if (env.BUGLAB_API_BASE_URL) {
  const api = new URL(env.BUGLAB_API_BASE_URL)
  const localApi = env.APP_ENV === 'development' && env.ALLOW_INSECURE_LOCAL_TARGETS && isDevelopmentLocalHost(api.hostname)
  if (api.pathname !== '/' || api.search || api.hash || api.username || api.password
    || (api.protocol !== 'https:' && !(api.protocol === 'http:' && localApi))
    || !env.ALLOWED_RESOURCE_ORIGINS.some(origin => new URL(origin).origin === api.origin)) {
    throw new Error('Invalid environment configuration: BUGLAB_API_BASE_URL must be an exact allowed resource origin')
  }
  if (!env.APPROVAL_USERNAME || !env.APPROVAL_PASSWORD) {
    throw new Error('Invalid environment configuration: BugLab API authentication requires approval credentials')
  }
}

if (Boolean(env.SUPABASE_URL) !== Boolean(env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error('Invalid environment configuration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together')
}

if (env.APP_ENV === 'production' && !env.SUPABASE_URL) {
  throw new Error('Invalid environment configuration: production requires Supabase for private evidence storage')
}
if (env.APP_ENV === 'production' && !env.CORS_ORIGIN) {
  throw new Error('Invalid environment configuration: production requires CORS_ORIGIN for the deployed frontend')
}
if (env.APP_ENV === 'production' && env.CORS_ORIGIN && new URL(env.CORS_ORIGIN).protocol !== 'https:') {
  throw new Error('Invalid environment configuration: production CORS_ORIGIN must use HTTPS')
}

if (env.VERIFICATION_RESET_URL) {
  const resetUrl = new URL(env.VERIFICATION_RESET_URL)
  if (resetUrl.username || resetUrl.password || resetUrl.search || resetUrl.hash) {
    throw new Error('Invalid environment configuration: VERIFICATION_RESET_URL must not contain credentials, query parameters, or a fragment; use VERIFICATION_RESET_TOKEN for authentication')
  }
}

if (env.PLANNER_MODE === 'openai' && !env.OPENAI_API_KEY) {
  throw new Error('Invalid environment configuration: OPENAI_API_KEY is required when PLANNER_MODE=openai')
}

if (Boolean(env.APPROVAL_USERNAME) !== Boolean(env.APPROVAL_PASSWORD)) {
  throw new Error('Invalid environment configuration: APPROVAL_USERNAME and APPROVAL_PASSWORD must be configured together')
}
