// Google reCAPTCHA v2 ("I'm not a robot" checkbox + image-grid puzzles) — shared,
// client-safe helpers.
//
// ARCHITECTURE: Supabase cannot verify Google reCAPTCHA natively (it supports
// only hCaptcha / Turnstile), so the enforcement point is OUR server. The auth
// forms POST the reCAPTCHA token to /api/auth/{login,signup,forgot}; those routes
// verify the token with Google (holding the SECRET) BEFORE touching Supabase, and
// hand the resulting session back to the browser. See docs/login-captcha.md.
//
// Only the PUBLIC site key is read here. When it is absent the whole feature is a
// graceful no-op (no widget, no gating) — mirroring the Supabase-optional and
// analytics-optional patterns, so local dev / un-provisioned deploys keep working.

import { publicEnv } from '@/lib/env-public'

/** The public reCAPTCHA site key, or undefined when the feature is not configured. */
export function recaptchaSiteKey(): string | undefined {
  const key = publicEnv('RECAPTCHA_SITE_KEY')?.trim()
  return key ? key : undefined
}

/** True when a site key is configured and the widget should be shown/required. */
export function isRecaptchaEnabled(): boolean {
  return !!recaptchaSiteKey()
}

// Explicit-render API so we control mount/reset precisely (tokens are single-use;
// after a failed attempt the parent resets the widget to get a fresh token).
export const RECAPTCHA_SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit'
