// Shared helpers for the server-side auth routes (app/api/auth/*).
//
// These routes are the reCAPTCHA-gated proxy in front of Supabase Auth: they
// verify the captcha token with Google, then perform the Supabase call with a
// FRESH, SESSIONLESS anon client (no persisted session on the server) and hand
// any resulting session back to the browser, which calls supabase.auth.setSession.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
}
export function supabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
}

/** A fresh, sessionless anon client per request (never shares/persists auth state). */
export function makeServerAnonClient(): SupabaseClient | null {
  const url = supabaseUrl()
  const key = supabaseAnonKey()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** Best-effort client IP from the standard proxy headers (Vercel sets these). */
export function clientIp(req: Request): string | undefined {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || undefined
  return req.headers.get('x-real-ip') || undefined
}

/** Same-origin reset/redirect target, derived from the request — never from the
 *  client body — so a crafted redirectTo cannot cause an open redirect. */
export function sameOriginUrl(req: Request, path: string): string {
  const origin = req.headers.get('origin') || new URL(req.url).origin
  return `${origin}${path}`
}
