// Startup environment validation. Parses Vite's `import.meta.env` against a Zod
// schema so misconfiguration surfaces immediately with a clear message instead
// of failing deep inside a Supabase call.
//
// NOTE: the Supabase vars are `optional()` for now because local (offline) mode
// still exists. Per the migration plan (Supabase-only), they become REQUIRED in
// the auth phase — flip `.optional()` off and `validateEnv()` will hard-fail a
// misconfigured production boot.

import { z } from 'zod'
import { logger } from './logger'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20).optional(),
})

export type AppEnv = z.infer<typeof envSchema>

let cached: AppEnv | null = null

export function validateEnv(): AppEnv {
  if (cached) return cached
  const parsed = envSchema.safeParse(import.meta.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    logger.error(`Invalid environment configuration: ${issues}`)
    // Non-fatal today (local mode is allowed). Fall back to the raw values so
    // the app still boots; the auth phase will make this a hard failure.
    cached = {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    }
    return cached
  }
  cached = parsed.data
  const hasSupabase = !!(cached.VITE_SUPABASE_URL && cached.VITE_SUPABASE_ANON_KEY)
  logger.info(
    hasSupabase ? 'Env OK — Supabase backend configured' : 'Env OK — local (offline) mode',
  )
  return cached
}

export const isSupabaseConfigured = (): boolean => {
  const e = validateEnv()
  return !!(e.VITE_SUPABASE_URL && e.VITE_SUPABASE_ANON_KEY)
}
