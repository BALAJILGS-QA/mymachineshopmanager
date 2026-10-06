// reCAPTCHA-gated login. Flow:
//   verify reCAPTCHA (Google, server-side) → if valid, signInWithPassword on a
//   sessionless anon client → return the session for the browser to setSession.
// A missing/invalid/replayed captcha token is rejected HERE and never reaches
// Supabase. Errors are generic (no account enumeration). Nothing sensitive
// (password, captcha token, access/refresh tokens) is ever logged.

import { NextResponse } from 'next/server'
import { verifyRecaptchaToken, isRecaptchaConfigured } from '@/server/recaptcha'
import { makeServerAnonClient, clientIp } from '@/server/authSupport'
import { rateLimit } from '@/server/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const ip = clientIp(req) || 'unknown'

  // Best-effort throttle (see src/server/rateLimit.ts for the honest scope).
  const rl = rateLimit(`login:${ip}`, 10, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfter) } },
    )
  }

  let body: { email?: unknown; password?: unknown; captchaToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken : null
  if (!email || !password) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
  }

  // CAPTCHA gate — mandatory when configured. Fail closed.
  if (isRecaptchaConfigured()) {
    const v = await verifyRecaptchaToken(captchaToken, ip === 'unknown' ? undefined : ip)
    if (!v.success) return NextResponse.json({ error: 'captcha_failed' }, { status: 400 })
  }

  const supabase = makeServerAnonClient()
  if (!supabase) return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    // Generic — never reveal whether the email exists or the password was wrong.
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
  }

  // Hand the session to the browser; it calls supabase.auth.setSession(...). The
  // client then runs the existing approval gate (list_app_users) on that session.
  return NextResponse.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  })
}
