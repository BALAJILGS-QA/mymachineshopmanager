'use client'

// Client island for /reset-password — the destination of the emailed reset link.
// It establishes the recovery session from the link (PKCE `code` or implicit hash
// tokens), then lets the user set a new password via supabase.auth.updateUser.

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { CheckCircle2, Loader2, Lock } from 'lucide-react'
import { supabase, isSupabaseEnabled } from '@/data/supabase'

const schema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })
type Values = z.infer<typeof schema>

type Phase = 'processing' | 'ready' | 'invalid' | 'done'

export function ResetForm() {
  const [phase, setPhase] = useState<Phase>('processing')
  const [error, setError] = useState<string | null>(null)

  // Establish the recovery session from the link once on mount.
  useEffect(() => {
    let active = true
    async function run() {
      if (!isSupabaseEnabled() || !supabase) {
        if (active) setPhase('invalid')
        return
      }
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')

        if (code) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(code)
          if (e) throw e
        } else if (accessToken && refreshToken) {
          const { error: e } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (e) throw e
        } else {
          // No recovery token in the URL — maybe already established, else invalid.
          const { data } = await supabase.auth.getUser()
          if (!data.user) {
            if (active) setPhase('invalid')
            return
          }
        }
        // Clean the token out of the URL bar.
        window.history.replaceState(null, '', '/reset-password')
        if (active) setPhase('ready')
      } catch {
        if (active) setPhase('invalid')
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    if (!supabase) {
      setError('Reset is unavailable right now.')
      return
    }
    try {
      const { error: e } = await supabase.auth.updateUser({ password: values.password })
      if (e) {
        setError(e.message || 'Could not update the password. The link may have expired.')
        return
      }
      // Sign out of the temporary recovery session so the user logs in fresh.
      await supabase.auth.signOut()
      setPhase('done')
    } catch {
      setError('Request failed. Please try again.')
    }
  })

  if (phase === 'processing') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white/85 p-8 text-sm text-[var(--ink-dim)] shadow-xl shadow-orange-900/5 backdrop-blur">
        <Loader2 size={16} className="animate-spin" /> Validating your reset link…
      </div>
    )
  }

  if (phase === 'invalid') {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/85 p-8 text-center shadow-xl shadow-orange-900/5 backdrop-blur">
        <h2 className="display text-xl font-bold text-[var(--ink)]">Link expired or invalid</h2>
        <p className="mt-2 text-sm text-[var(--ink-dim)]">
          This password reset link is no longer valid. Please request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="btn-primary mt-5 inline-flex w-full justify-center py-2.5"
        >
          Request a new link
        </Link>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/85 p-8 text-center shadow-xl shadow-orange-900/5 backdrop-blur">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={24} />
        </div>
        <h2 className="display text-xl font-bold text-[var(--ink)]">Password updated</h2>
        <p className="mt-2 text-sm text-[var(--ink-dim)]">
          Your password has been changed. You can now sign in with your new password.
        </p>
        <Link href="/login" className="btn-primary mt-5 inline-flex w-full justify-center py-2.5">
          Go to sign in
        </Link>
      </div>
    )
  }

  // phase === 'ready'
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-[var(--line)] bg-white/85 p-6 shadow-xl shadow-orange-900/5 backdrop-blur sm:p-7"
    >
      <div>
        <label className="label" htmlFor="password">
          New password <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Lock
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            id="password"
            className="input pl-9"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            {...register('password')}
          />
        </div>
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>

      <div className="mt-3.5">
        <label className="label" htmlFor="confirm">
          Confirm password <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Lock
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            id="confirm"
            className="input pl-9"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            {...register('confirm')}
          />
        </div>
        {errors.confirm && <p className="mt-1 text-xs text-red-600">{errors.confirm.message}</p>}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-4 w-full py-2.5" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        Update password
      </button>
    </form>
  )
}
