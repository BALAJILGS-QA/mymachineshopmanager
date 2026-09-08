'use client'

// Shared Cloudflare Turnstile CAPTCHA widget for the auth forms (login + signup).
// Wraps @marsidev/react-turnstile so all forms behave identically: emit the token
// on success, clear it on expiry/error, and expose reset() so a form can re-arm
// the widget after a failed attempt (Turnstile tokens are single-use).
//
// Framework-agnostic on purpose — lives under src/features/** and imports no
// next/* modules, so both the Next `/login` island and the shared landing
// AuthForm can render it.

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { publicEnv } from '@/lib/env-public'

// Cloudflare's official test site key that ALWAYS passes. Used when no real key
// is configured (local-mode dev / unset env) so the widget still renders and the
// "always require a token" gate keeps working without blocking development.
// See https://developers.cloudflare.com/turnstile/troubleshooting/testing/
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

/** Resolve the configured Turnstile site key, or the always-passing test key. */
export function turnstileSiteKey(): string {
  return publicEnv('TURNSTILE_SITE_KEY') || TURNSTILE_TEST_SITE_KEY
}

export interface CaptchaHandle {
  /** Reset the widget so the user can solve a fresh challenge. */
  reset: () => void
}

interface CaptchaProps {
  /** Called with the token on success, or null when it expires / errors out. */
  onToken: (token: string | null) => void
  className?: string
}

export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(function Captcha(
  { onToken, className },
  ref,
) {
  const widget = useRef<TurnstileInstance | undefined>(undefined)

  useImperativeHandle(ref, () => ({
    reset: () => {
      widget.current?.reset()
      onToken(null)
    },
  }))

  return (
    <div className={className}>
      <Turnstile
        ref={widget}
        siteKey={turnstileSiteKey()}
        onSuccess={(token) => onToken(token)}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
        options={{ size: 'flexible' }}
      />
    </div>
  )
})
