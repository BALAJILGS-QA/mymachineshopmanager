'use client'

// Client island for /forgot-password. Sends a Supabase password-reset email to
// the registered address; the link lands on /reset-password where the new
// password is set. In local (non-Supabase) mode email reset isn't available.

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react'
import { supabase, isSupabaseEnabled } from '@/data/supabase'
import { logger } from '@/lib/logger'
import { BRAND } from '@/lib/brand'

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
})
type Values = z.infer<typeof schema>

export function ForgotForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const supabaseMode = isSupabaseEnabled()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    if (!supabaseMode || !supabase) {
      setError(
        'Password reset by email is unavailable in local mode. Please contact your administrator.',
      )
      return
    }
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error: e } = await supabase.auth.resetPasswordForEmail(values.email.trim(), {
        redirectTo,
      })
      // Do not reveal whether the address exists — always show the same result.
      if (e && !/rate limit/i.test(e.message)) {
        // Still show success to avoid account enumeration, but log for debugging.
        logger.warn('resetPasswordForEmail failed', e.message)
      }
      setSentTo(values.email.trim())
    } catch {
      setError('Request failed. Please check your connection and try again.')
    }
  })

  if (sentTo) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/85 p-8 text-center shadow-xl shadow-orange-900/5 backdrop-blur">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={24} />
        </div>
        <h2 className="display text-xl font-bold text-[var(--ink)]">Check your email</h2>
        <p className="mt-2 text-sm text-[var(--ink-dim)]">
          If an account exists for <b className="break-all">{sentTo}</b>, we&apos;ve sent a password
          reset link. Open it to choose a new password.
        </p>
        <Link href="/login" className="btn-secondary mt-5 inline-flex w-full justify-center py-2.5">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-[var(--line)] bg-white/85 p-6 shadow-xl shadow-orange-900/5 backdrop-blur sm:p-7"
    >
      <div>
        <label className="label" htmlFor="email">
          Registered email <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Mail
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            id="email"
            className="input pl-9"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email')}
          />
        </div>
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-4 w-full py-2.5" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        Send reset link
      </button>

      <Link
        href="/login"
        className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-[var(--ink-dim)] transition hover:text-[var(--ink)]"
      >
        <ArrowLeft size={15} /> Back to sign in
      </Link>

      <p className="mt-4 text-center text-2xs text-slate-500">
        Reset links are sent from {BRAND.legalName}.
      </p>
    </form>
  )
}
