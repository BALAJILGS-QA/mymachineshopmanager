'use client'

// Client island for the dedicated /signup (registration) page. Collects the
// applicant's details and submits a registration for super-admin approval via
// the shared useAuth().register() — it does NOT sign the user in. The pending
// profile is stored in the users list (app_state) and surfaces in the app's
// User Approvals grid; the applicant can sign in only after approval.

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Building2,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  User,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/features/auth/auth'

const signUpSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  companyName: z.string().trim().default(''),
  phone: z.string().trim().default(''),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  address: z.string().trim().default(''),
  gstin: z.string().trim().default(''),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type SignUpValues = z.infer<typeof signUpSchema>

export function SignupForm() {
  const { register: registerUser } = useAuth()
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: '',
      companyName: '',
      phone: '',
      email: '',
      address: '',
      gstin: '',
      password: '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const res = await registerUser(values)
      if (!res.ok) setError(res.message || 'Could not submit registration')
      else setSubmitted(values.fullName)
    } catch {
      setError('Request failed. Please check your connection and try again.')
    }
  })

  if (submitted !== null) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/85 p-8 text-center shadow-xl shadow-orange-900/5 backdrop-blur">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={24} />
        </div>
        <h2 className="display text-xl font-bold text-[var(--ink)]">Registration submitted</h2>
        <p className="mt-2 text-sm text-[var(--ink-dim)]">
          Thanks, <b>{submitted || 'there'}</b>. Your account is <b>pending approval</b> by the
          administrator. You&apos;ll be able to sign in once it&apos;s approved.
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
      className="rounded-2xl border border-[var(--line)] bg-white/85 p-5 shadow-xl shadow-orange-900/5 backdrop-blur sm:p-6"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <IconField icon={User} label="Full Name" required error={errors.fullName?.message}>
          <input className="input pl-9" aria-label="Full Name" {...register('fullName')} />
        </IconField>
        <IconField icon={Building2} label="Company Name">
          <input className="input pl-9" aria-label="Company Name" {...register('companyName')} />
        </IconField>
        <IconField icon={Phone} label="Phone">
          <input className="input pl-9" aria-label="Phone" {...register('phone')} />
        </IconField>
        <IconField icon={Mail} label="Email" required error={errors.email?.message}>
          <input
            className="input pl-9"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email"
            {...register('email')}
          />
        </IconField>
      </div>
      <div className="mt-3">
        <IconField icon={MapPin} label="Address">
          <input className="input pl-9" aria-label="Address" {...register('address')} />
        </IconField>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <IconField icon={ReceiptText} label="GSTIN / Tax ID">
          <input className="input pl-9" aria-label="GSTIN" {...register('gstin')} />
        </IconField>
        <IconField icon={Lock} label="Password" required error={errors.password?.message}>
          <input
            className="input pl-9"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-label="Password"
            {...register('password')}
          />
        </IconField>
      </div>
      <p className="mt-1.5 text-2xs text-slate-500">At least 6 characters.</p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-4 w-full py-2.5" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        Create account
      </button>

      <p className="mt-4 text-center text-xs text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}

function IconField({
  icon: Icon,
  label,
  required,
  error,
  children,
}: {
  icon: LucideIcon
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className="relative">
        <Icon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
        />
        {children}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
