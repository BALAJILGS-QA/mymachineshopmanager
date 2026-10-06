// Server-side Google reCAPTCHA v2 verification.
//
// This IS the enforcement point: Supabase cannot verify reCAPTCHA, so the auth
// routes (app/api/auth/*) call this BEFORE touching Supabase. A request with a
// missing/invalid/replayed token is rejected here and never reaches the auth
// logic. The secret is read only on the server and never reaches the client.

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

export interface RecaptchaVerifyResult {
  success: boolean
  /** Google error codes, e.g. 'missing-input-response', 'timeout-or-duplicate'. */
  errorCodes: string[]
}

function secretKey(): string | undefined {
  const key = process.env.RECAPTCHA_SECRET_KEY?.trim()
  return key ? key : undefined
}

/** True when a secret is configured and server-side verification is possible. */
export function isRecaptchaConfigured(): boolean {
  return !!secretKey()
}

/**
 * Verify a reCAPTCHA token with Google's siteverify endpoint. Never throws for an
 * auth failure; network/parse failures resolve to `{ success: false, ... }` so
 * callers fail closed.
 *
 * @param token    the `g-recaptcha-response` token from the browser widget
 * @param remoteIp optional client IP to bind the check to (recommended)
 */
export async function verifyRecaptchaToken(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<RecaptchaVerifyResult> {
  const secret = secretKey()
  if (!secret) return { success: false, errorCodes: ['missing-secret'] }
  if (!token) return { success: false, errorCodes: ['missing-input-response'] }

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return { success: false, errorCodes: [`http-${res.status}`] }
    const data = (await res.json()) as {
      success?: boolean
      'error-codes'?: string[]
    }
    return {
      success: data.success === true,
      errorCodes: Array.isArray(data['error-codes']) ? data['error-codes'] : [],
    }
  } catch {
    return { success: false, errorCodes: ['network-error'] }
  }
}
