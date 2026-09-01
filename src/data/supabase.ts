import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { publicEnv } from '@/lib/env-public'

// The Supabase client is created only when both env vars are present. When they
// are absent the app runs in local-only mode (localStorage) exactly as before.
// Env is read through the cross-runtime shim so the SAME module works under both
// Vite (`VITE_*` via import.meta.env) and Next.js (`NEXT_PUBLIC_*` via process.env)
// during the migration.
const url = publicEnv('SUPABASE_URL')
const anonKey = publicEnv('SUPABASE_ANON_KEY')

// Pass-through lock: the default uses the Web Locks API (navigator.locks),
// which can deadlock across reloads / multiple contexts and leave auth calls
// hanging forever. A single-user shop app doesn't need cross-tab locking.
const passThroughLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => fn()

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          lock: passThroughLock,
        },
      })
    : null

export function isSupabaseEnabled(): boolean {
  return supabase !== null
}
