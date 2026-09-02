'use client'

// Client island for the dedicated /login page. Renders the "Welcome Back" sign-in
// panel (left column of the split-screen login) and drives Supabase/local auth via
// the shared `useAuth` hook — the same login logic used by the landing AuthForm,
// kept router-agnostic here by pushing to /app on success.

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, Loader2, Lock, Mail, User } from 'lucide-react'
import { useAuth } from '@/features/auth/auth'
import { useToast } from '@/components/ui/Toast'

const signInSchema = z.object({
  loginId: z.string().trim().min(1, 'Required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type SignInValues = z.infer<typeof signInSchema>

export function LoginForm() {
  const router = useRouter()
  const { session, login, supabaseMode } = useAuth()
  const toast = useToast()

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
    try {
      const res = await login(values.loginId, values.password)
      if (!res.ok) toast.error(res.message || 'Invalid credentials')
      else router.push('/app')
    } catch {
      toast.error('Request failed. Please check your connection and try again.')
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
            className="input pl-9"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register('password')}
          />
        </div>
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>

      <button type="submit" className="btn-primary w-full py-2.5" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
        Login <ArrowRight size={16} />
      </button>

      {!supabaseMode && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-2xs text-slate-500">
          Super admin — <b>superadmin</b> / <b>superadmin123</b>
        </p>
      )}
    </form>
  )
}
