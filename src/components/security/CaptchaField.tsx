'use client'

// Login/sign-up ready wrapper around the raw <Recaptcha> (Google reCAPTCHA v2)
// widget. It supplies the "Verify you are human" caption, an accessible
// (role="alert") status line for the expired/error states, and normalises the
// widget callbacks into a single `onToken(token | null)` so a form only tracks
// one piece of state.
//
// Forward a ref to call `reset()` after a rejected submit — reCAPTCHA tokens are
// single-use, so a fresh challenge is needed before the next attempt.

import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Recaptcha, type RecaptchaHandle } from './Recaptcha'
import { isRecaptchaEnabled } from '@/lib/security/recaptcha'

export interface CaptchaFieldHandle {
  /** Clear the token and re-run the challenge (call after a rejected submit). */
  reset: () => void
}

interface CaptchaFieldProps {
  /** Receives the token on success, or null when it is cleared/expired/errored. */
  onToken: (token: string | null) => void
  label?: string
  className?: string
}

const MESSAGES = {
  expired: 'Verification expired. Please complete the verification again.',
  error: 'Unable to verify at the moment. Please try again.',
} as const

function CaptchaFieldInner(
  { onToken, label = 'Verify you are human', className }: CaptchaFieldProps,
  ref: Ref<CaptchaFieldHandle>,
) {
  const widgetRef = useRef<RecaptchaHandle>(null)
  const [status, setStatus] = useState<'idle' | 'expired' | 'error'>('idle')

  const reset = useCallback(() => {
    setStatus('idle')
    onToken(null)
    widgetRef.current?.reset()
  }, [onToken])

  useImperativeHandle(ref, () => ({ reset }), [reset])

  // Feature not configured → nothing to show, and the form does not gate on it.
  if (!isRecaptchaEnabled()) return null

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <ShieldCheck size={14} className="text-brand-600" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <Recaptcha
        ref={widgetRef}
        onVerify={(token) => {
          setStatus('idle')
          onToken(token)
        }}
        onExpire={() => {
          setStatus('expired')
          onToken(null)
        }}
        onError={() => {
          setStatus('error')
          onToken(null)
        }}
      />
      {status !== 'idle' && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {MESSAGES[status]}
        </p>
      )}
    </div>
  )
}

export const CaptchaField = forwardRef<CaptchaFieldHandle, CaptchaFieldProps>(CaptchaFieldInner)
CaptchaField.displayName = 'CaptchaField'
