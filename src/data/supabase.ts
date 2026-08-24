import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The Supabase client is created only when both env vars are present. When they
// are absent the app runs in local-only mode (localStorage) exactly as before.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

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
