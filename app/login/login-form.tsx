'use client'

// Client island for the dedicated /login page. Renders the "Welcome Back" sign-in
// panel (left column of the split-screen login) and drives Supabase/local auth via
// the shared `useAuth` hook — the same login logic used by the landing AuthForm,
// kept router-agnostic here by pushing to /app on success.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react'
import { useAuth } from '@/features/auth/auth'
import { useToast } from '@/components/ui/Toast'
import { CaptchaField, type CaptchaFieldHandle } from '@/components/security/CaptchaField'
import { isRecaptchaEnabled } from '@/lib/security/recaptcha'

const signInSchema = z.object({
  loginId: z.string().trim().min(1, 'Required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type SignInValues = z.infer<typeof signInSchema>

export function LoginForm() {
  const router = useRouter()
  const { session, login, supabaseMode } = useAuth()
  const toast = useToast()
  const [showPassword, setShowPassword] = useState(false)

  // CAPTCHA state. When a site key is configured the token is REQUIRED before
  // sign-in; when it is absent the feature is a no-op and nothing gates.
  const captchaRequired = isRecaptchaEnabled()
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaRef = useRef<CaptchaFieldHandle>(null)

  // Already signed in → straight to the portal (mirrors AuthForm behaviour).
  useEffect(() => {
    if (session) router.push('/app')
  }, [session, router])

  const idLabel = supabaseMode ? 'Email' : 'Username or Email'
  const IdIcon = supabaseMode ? Mail : User
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { loginId: supabaseMode ? '' : 'superadmin', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    if (captchaRequired && !captchaToken) {
      toast.error('Please complete the verification.')
      return
    }
    try {
      const res = await login(values.loginId, values.password, captchaToken ?? undefined)
      if (!res.ok) {
        toast.error(res.message || 'Invalid email or password')
        // The token (if any) was consumed by the server; get a fresh one for the
        // next attempt — single-use tokens cannot be replayed.
        if (captchaRequired) {
          setCaptchaToken(null)
          captchaRef.current?.reset()
        }
      } else router.push('/app')
    } catch {
      toast.error('Request failed. Please check your connection and try again.')
      if (captchaRequired) {
        setCaptchaToken(null)
        captchaRef.current?.reset()
      }
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label className="label" htmlFor="loginId">
          {idLabel} <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <IdIcon
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            id="loginId"
            className="input pl-9"
            type={supabaseMode ? 'email' : 'text'}
            autoComplete={supabaseMode ? 'email' : 'username'}
            placeholder={supabaseMode ? 'Enter email or username' : ''}
            {...register('loginId')}
          />
        </div>
        {errors.loginId && <p className="mt-1 text-xs text-red-600">{errors.loginId.message}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">
            Password <span className="text-red-500">*</span>
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            Forgot Password?
          </Link>
        </div>
        <div className="relative">
          <Lock
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            id="password"
            className="input pl-9 pr-9"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
        <p className="mt-2 text-xs text-slate-500">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="font-semibold text-brand-600 hover:underline">
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </div>

      <CaptchaField ref={captchaRef} onToken={setCaptchaToken} />

      <button
        type="submit"
        className="btn-primary w-full py-2.5"
        disabled={isSubmitting || (captchaRequired && !captchaToken)}
      >
        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
        {isSubmitting ? 'Signing in…' : 'Login'}
        {!isSubmitting && <ArrowRight size={16} />}
      </button>
      {captchaRequired && !captchaToken && (
        <p className="text-center text-xs text-slate-500">
          Complete the verification above to continue.
        </p>
      )}

      {!supabaseMode && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-2xs text-slate-500">
          Super admin — <b>superadmin</b> / <b>superadmin123</b>
        </p>
      )}
    </form>
  )
}
