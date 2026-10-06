// reCAPTCHA-gated password-reset request. Flow:
//   verify reCAPTCHA (server-side) → resetPasswordForEmail on a sessionless anon
//   client, with a SAME-ORIGIN redirect derived from the request (never from the
//   client body, to avoid open-redirect). Always returns { ok: true } on a valid
//   captcha — regardless of whether the address exists — to prevent account
//   enumeration. A missing/invalid captcha token is rejected before Supabase.

import { NextResponse } from 'next/server'
import { verifyRecaptchaToken, isRecaptchaConfigured } from '@/server/recaptcha'
import { makeServerAnonClient, clientIp, sameOriginUrl } from '@/server/authSupport'
import { rateLimit } from '@/server/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const ip = clientIp(req) || 'unknown'

  const rl = rateLimit(`forgot:${ip}`, 5, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfter) } },
    )
  }

  let body: { email?: unknown; captchaToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken : null
  if (!email) return NextResponse.json({ error: 'missing_fields' }, { status: 400 })

  if (isRecaptchaConfigured()) {
    const v = await verifyRecaptchaToken(captchaToken, ip === 'unknown' ? undefined : ip)
    if (!v.success) return NextResponse.json({ error: 'captcha_failed' }, { status: 400 })
  }

  const supabase = makeServerAnonClient()
  if (!supabase) return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 })

  // Fire the reset email; swallow non-captcha errors so the response never
  // reveals whether the account exists.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: sameOriginUrl(req, '/reset-password'),
  })

  return NextResponse.json({ ok: true })
}
