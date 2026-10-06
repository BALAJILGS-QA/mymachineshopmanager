'use client'

// Google reCAPTCHA v2 widget — the "I'm not a robot" checkbox that escalates to
// the image-grid puzzle ("select all images with a bus") when Google's risk
// engine is suspicious.
//
// Router/framework-agnostic: depends only on React, the DOM and the client-safe
// env helper, so it is used from both the Next `app/**` islands and shared
// `src/features/**` components (the landing AuthForm). Renders NOTHING when no
// site key is configured — callers then treat captcha as not-required.
//
// Explicit render mode (`?render=explicit`) is used so we control mount + reset
// (tokens are single-use; after a rejected attempt the parent calls reset()).

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { recaptchaSiteKey, RECAPTCHA_SCRIPT_SRC } from '@/lib/security/recaptcha'
import { logger } from '@/lib/logger'

export interface RecaptchaHandle {
  /** Discard the current token and re-run the challenge (tokens are single-use). */
  reset: () => void
}

interface RecaptchaProps {
  /** Receives a fresh verification token when the challenge is solved. */
  onVerify: (token: string) => void
  /** Fired when the token expires; the parent should clear its stored token. */
  onExpire?: () => void
  /** Fired on a widget/network error; the parent should surface a friendly message. */
  onError?: () => void
  className?: string
}

interface GrecaptchaApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      theme?: 'light' | 'dark'
      size?: 'normal' | 'compact'
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
    },
  ) => number
  reset: (id?: number) => void
}

declare global {
  interface Window {
    grecaptcha?: GrecaptchaApi
  }
}

// Load the reCAPTCHA script exactly once per document, shared across every widget
// instance. Resolves when `window.grecaptcha.render` is callable.
let scriptPromise: Promise<void> | null = null
function loadRecaptchaScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.grecaptcha?.render) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    // Poll until the API object is fully initialised (the script's load event
    // can fire slightly before `grecaptcha.render` is attached).
    const waitForApi = () => {
      const started = performance.now()
      const tick = () => {
        if (window.grecaptcha?.render) return resolve()
        if (performance.now() - started > 10_000) return reject(new Error('recaptcha timeout'))
        setTimeout(tick, 50)
      }
      tick()
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-recaptcha]')
    if (existing) {
      waitForApi()
      return
    }
    const s = document.createElement('script')
    s.src = RECAPTCHA_SCRIPT_SRC
    s.async = true
    s.defer = true
    s.dataset.recaptcha = 'true'
    s.addEventListener('load', waitForApi)
    s.addEventListener('error', () => reject(new Error('recaptcha script failed')))
    document.head.appendChild(s)
  })
  return scriptPromise
}

function RecaptchaInner(
  { onVerify, onExpire, onError, className }: RecaptchaProps,
  ref: Ref<RecaptchaHandle>,
) {
  const siteKey = recaptchaSiteKey()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<number | null>(null)

  // Keep the latest callbacks in refs so the one-time render effect never needs
  // to re-run (and re-create the widget) when a parent re-renders.
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  const onErrorRef = useRef(onError)
  onVerifyRef.current = onVerify
  onExpireRef.current = onExpire
  onErrorRef.current = onError

  const reset = useCallback(() => {
    if (widgetIdRef.current !== null && window.grecaptcha) {
      try {
        window.grecaptcha.reset(widgetIdRef.current)
      } catch {
        /* no-op: widget already gone */
      }
    }
  }, [])

  useImperativeHandle(ref, () => ({ reset }), [reset])

  useEffect(() => {
    if (!siteKey || typeof window === 'undefined') return
    let cancelled = false

    loadRecaptchaScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.grecaptcha) return
        // Guard against a double-render (React StrictMode) creating two widgets.
        if (widgetIdRef.current !== null) return
        widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          size: 'normal',
          callback: (token) => onVerifyRef.current(token),
          'expired-callback': () => onExpireRef.current?.(),
          'error-callback': () => onErrorRef.current?.(),
        })
      })
      .catch(() => {
        logger.warn('reCAPTCHA failed to load')
        if (!cancelled) onErrorRef.current?.()
      })

    return () => {
      cancelled = true
      // reCAPTCHA v2 has no official "remove"; React unmounts the container (and
      // its iframe) and we drop the stale id so a remount renders fresh.
      widgetIdRef.current = null
    }
  }, [siteKey])

  // Not configured → render nothing; callers do not gate on captcha.
  if (!siteKey) return null

  return <div ref={containerRef} className={className} aria-label="Human verification challenge" />
}

export const Recaptcha = forwardRef<RecaptchaHandle, RecaptchaProps>(RecaptchaInner)
Recaptcha.displayName = 'Recaptcha'
