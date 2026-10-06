// Best-effort in-memory fixed-window rate limiter for the auth routes.
//
// SCOPE / HONESTY: Vercel Functions are multi-instance and stateless, so this
// map is per-warm-instance and resets on cold start — it is a cheap first line
// that trips obvious hammering, NOT a distributed guarantee. The real brute-force
// defences are (1) reCAPTCHA, which forces a fresh solved challenge per attempt,
// (2) Supabase GoTrue's own auth rate limits, and (3) the Vercel Firewall/WAF
// rate-limit rules (recommended for production). For a strict shared limit, back
// this with Upstash Redis / Vercel KV. No database table is introduced.

interface Window {
  count: number
  resetAt: number
}

const buckets = new Map<string, Window>()

export interface RateLimitResult {
  ok: boolean
  /** Seconds until the window resets (only meaningful when !ok). */
  retryAfter: number
}

/**
 * Register a hit for `key`. Allows up to `limit` hits per `windowMs`.
 * Returns `{ ok: false, retryAfter }` once the limit is exceeded.
 */
export function rateLimit(
  key: string,
  limit = 10,
  windowMs = 60_000,
  now = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key)
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  existing.count += 1
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) }
  }
  return { ok: true, retryAfter: 0 }
}

/** Test/maintenance helper — clear all counters. */
export function resetRateLimits(): void {
  buckets.clear()
}
