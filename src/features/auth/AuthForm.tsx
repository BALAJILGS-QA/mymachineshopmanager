import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowRight,
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
import { clsx } from 'clsx'
import { useAuth } from './auth'
import { useToast } from '@/components/ui/Toast'
import { Logo } from '@/components/ui/Logo'
import { BRAND } from '@/lib/brand'

type Mode = 'signin' | 'signup'

// ---- Validation schemas (React Hook Form + Zod via zodResolver). Rules match
// the previous imperative checks exactly: password >= 6, sign-up requires full
// name + email. Errors now ALSO render inline under each field while the
// submit handlers keep toasting server-side failures as before.
const signInSchema = z.object({
  loginId: z.string().trim().min(1, 'Required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type SignInValues = z.infer<typeof signInSchema>

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

// Self-contained auth card embedded in the landing page. Sign-up collects the
// applicant's details and submits a registration for super-admin approval — it
// does NOT sign the user in. Sign-in only succeeds for approved accounts.
//
// Router-agnostic: navigation to the portal is injected via `onAuthenticated`
// so the same component works under both TanStack Router (Vite) and Next.js.
export function AuthForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { session, supabaseMode } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [submitted, setSubmitted] = useState<string | null>(null)

  useEffect(() => {
    if (session) onAuthenticated()
  }, [session, onAuthenticated])

  function switchMode(m: Mode) {
    setMode(m)
    setSubmitted(null)
  }

  if (session) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/90 p-8 text-center shadow-xl shadow-orange-900/10 backdrop-blur">
        <Logo size={48} className="mx-auto mb-3 rounded-[28%] shadow-sm" />
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="font-semibold text-slate-800">{session.username}</p>
        <button className="btn-primary mt-4 w-full py-2.5" onClick={onAuthenticated}>
          Enter Portal <ArrowRight size={16} />
        </button>
      </div>
    )
  }

  // Post-registration confirmation — pending approval.
  if (submitted !== null) {
    return (
      <div
        id="access"
        className="rounded-2xl border border-[var(--line)] bg-white/90 p-7 text-center shadow-xl shadow-orange-900/10 backdrop-blur"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={24} />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Registration submitted</h2>
        <p className="mt-2 text-sm text-slate-600">
          Thanks, <b>{submitted || 'there'}</b>. Your account is <b>pending approval</b> by the
          administrator. You&apos;ll be able to sign in once it&apos;s approved.
        </p>
        <button className="btn-secondary mt-5 w-full py-2.5" onClick={() => switchMode('signin')}>
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div
      id="access"
      className="max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--line)] bg-white/90 p-6 shadow-xl shadow-orange-900/10 backdrop-blur sm:p-7"
    >
      <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-4">
        <Logo size={44} className="shrink-0 rounded-[28%] shadow-sm" />
        <p className="text-[15px] font-bold tracking-tight text-slate-900">{BRAND.product}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(['signin', 'signup'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={clsx(
              'rounded-lg py-2 text-sm font-semibold transition',
              mode === m
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {m === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-slate-500">
        {mode === 'signup'
          ? 'Register your details — an administrator will review and approve your access.'
          : 'Sign in to manage your shop floor.'}
      </p>

      {mode === 'signin' ? (
        <SignInForm supabaseMode={supabaseMode} />
      ) : (
        <SignUpForm onSubmitted={(name) => setSubmitted(name)} />
      )}

      <p className="mt-4 text-center text-xs text-slate-500">
        {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
        <button
          type="button"
          className="font-semibold text-brand-600 hover:underline"
          onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
        >
          {mode === 'signup' ? 'Sign in' : 'Register'}
        </button>
      </p>

      {!supabaseMode && mode === 'signin' && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-center text-2xs text-slate-500">
          Super admin — <b>superadmin</b> / <b>superadmin123</b>
        </p>
      )}
    </div>
  )
}

function SignInForm({ supabaseMode }: { supabaseMode: boolean }) {
  const { login } = useAuth()
  const toast = useToast()
  const idLabel = supabaseMode ? 'Email' : 'Username or Email'
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
      // On success the session effect (in AuthForm) redirects to /app.
    } catch {
      toast.error('Request failed. Please check your connection and try again.')
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-3.5" noValidate>
      <IconField
        icon={supabaseMode ? Mail : User}
        label={idLabel}
        required
        error={errors.loginId?.message}
      >
        <input
          className="input pl-9"
          type={supabaseMode ? 'email' : 'text'}
          autoComplete={supabaseMode ? 'email' : 'username'}
          placeholder={supabaseMode ? 'you@example.com' : ''}
          aria-label={idLabel}
          {...register('loginId')}
        />
      </IconField>
      <IconField icon={Lock} label="Password" required error={errors.password?.message}>
        <input
          className="input pl-9"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-label="Password"
          {...register('password')}
        />
      </IconField>
      <button type="submit" className="btn-primary w-full py-2.5" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        Sign in
      </button>
    </form>
  )
}

function SignUpForm({ onSubmitted }: { onSubmitted: (fullName: string) => void }) {
  const { register: registerUser } = useAuth()
  const toast = useToast()
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
    try {
      const res = await registerUser(values)
      if (!res.ok) {
        toast.error(res.message || 'Could not submit registration')
      } else {
        onSubmitted(values.fullName)
      }
    } catch {
      toast.error('Request failed. Please check your connection and try again.')
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-3.5" noValidate>
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
      <IconField icon={MapPin} label="Address">
        <input className="input pl-9" aria-label="Address" {...register('address')} />
      </IconField>
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
      <p className="text-2xs text-slate-500">At least 6 characters.</p>
      <button type="submit" className="btn-primary w-full py-2.5" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        Submit registration
      </button>
    </form>
  )
}

// Labelled input wrapper with a leading icon and inline validation error.
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
  const id = useId()
  return (
    <div>
      <label className="label" htmlFor={id}>
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
