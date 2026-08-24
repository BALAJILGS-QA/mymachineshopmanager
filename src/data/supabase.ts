import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The Supabase client is created only when both env vars are present. When they
// are absent the app runs in local-only mode (localStorage) exactly as before.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null

export function isSupabaseEnabled(): boolean {
  return supabase !== null
}
