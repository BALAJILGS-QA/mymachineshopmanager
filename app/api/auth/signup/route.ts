// reCAPTCHA-gated registration. Flow:
//   verify reCAPTCHA (server-side) → signUp on a sessionless anon client → merge
//   the applicant's profile via the register_pending_user RPC (SECURITY DEFINER;
//   can never set status=approved, so the approval gate stays intact).
// Does NOT sign the user in — registration is pending super-admin approval. A
// missing/invalid captcha token is rejected before Supabase is touched.

import { NextResponse } from 'next/server'
import { verifyRecaptchaToken, isRecaptchaConfigured } from '@/server/recaptcha'
import { makeServerAnonClient, clientIp } from '@/server/authSupport'
import { rateLimit } from '@/server/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const ip = clientIp(req) || 'unknown'

  const rl = rateLimit(`signup:${ip}`, 5, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfter) } },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
  const email = str('email')
  const password = typeof body.password === 'string' ? body.password : ''
  const captchaToken = typeof body.captchaToken === 'string' ? body.captchaToken : null
  if (!email || !password) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  if (isRecaptchaConfigured()) {
    const v = await verifyRecaptchaToken(captchaToken, ip === 'unknown' ? undefined : ip)
    if (!v.success) return NextResponse.json({ error: 'captcha_failed' }, { status: 400 })
  }

  const signUpClient = makeServerAnonClient()
  if (!signUpClient) return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 })

  const { error: signUpErr } = await signUpClient.auth.signUp({ email, password })
  if (signUpErr) {
    // Preserve existing UX (e.g. "Password should be at least 6 characters").
    return NextResponse.json(
      { error: 'signup_failed', message: signUpErr.message },
      { status: 400 },
    )
  }

  // Merge the profile on a SEPARATE fresh anon client so the RPC never rides the
  // just-issued sign-up token (avoids the "JWT issued at future" clock skew).
  const rpcClient = makeServerAnonClient()!
  const { error: rpcErr } = await rpcClient.rpc('register_pending_user', {
    p_email: email,
    p_full_name: str('fullName'),
    p_company: str('companyName'),
    p_phone: str('phone'),
    p_address: str('address'),
    p_gstin: str('gstin'),
  })
  if (rpcErr) {
    return NextResponse.json({ error: 'profile_failed', message: rpcErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, pending: true })
}
