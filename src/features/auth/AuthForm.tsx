import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from './auth'
import { useToast } from '@/components/ui/Toast'
import { Logo } from '@/components/ui/Logo'
import { BRAND } from '@/lib/brand'

type Mode = 'signin' | 'signup'

// Self-contained auth card embedded in the landing page. Sign-up collects the
// applicant's details and submits a registration for super-admin approval — it
// does NOT sign the user in. Sign-in only succeeds for approved accounts.
export function AuthForm() {
  const { login, register, session, supabaseMode } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Sign-in identity: email (Supabase) or username/email (local).
  const [loginId, setLoginId] = useState(!supabaseMode ? 'superadmin' : '')
  const [password, setPassword] = useState('')

  // Sign-up fields.
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [gstin, setGstin] = useState('')

  const isSignup = mode === 'signup'
  const idLabel = supabaseMode ? 'Email' : 'Username or Email'

  useEffect(() => {
    if (session) navigate('/app')
  }, [session, navigate])

  function switchMode(m: Mode) {
    setMode(m)
    setSubmitted(false)
    setPassword('')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (isSignup && (!fullName.trim() || !email.trim())) {
      toast.error('Full name and email are required')
      return
    }
    setBusy(true)
    try {
      if (isSignup) {
        const res = await register({
          email,
          password,
          fullName,
          companyName,
          phone,
          address,
          gstin,
        })
        if (!res.ok) {
          toast.error(res.message || 'Could not submit registration')
        } else {
          setSubmitted(true)
        }
      } else {
        const res = await login(loginId, password)
        if (!res.ok) toast.error(res.message || 'Invalid credentials')
        // On success the session effect redirects to /app.
      }
    } catch {
      toast.error('Request failed. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (session) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/90 p-8 text-center shadow-xl shadow-lime-900/10 backdrop-blur">
        <Logo size={48} className="mx-auto mb-3 rounded-[28%] shadow-sm" />
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="font-semibold text-slate-800">{session.username}</p>
        <button className="btn-primary mt-4 w-full py-2.5" onClick={() => navigate('/app')}>
          Enter Portal <ArrowRight size={16} />
        </button>
      </div>
    )
  }

  // Post-registration confirmation — pending approval.
  if (submitted) {
    return (
      <div
        id="access"
        className="rounded-2xl border border-[var(--line)] bg-white/90 p-7 text-center shadow-xl shadow-lime-900/10 backdrop-blur"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={24} />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Registration submitted</h2>
        <p className="mt-2 text-sm text-slate-600">
          Thanks, <b>{fullName || 'there'}</b>. Your account is <b>pending approval</b> by the
          administrator. You'll be able to sign in once it's approved.
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
      className="max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--line)] bg-white/90 p-6 shadow-xl shadow-lime-900/10 backdrop-blur sm:p-7"
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
              mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {m === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-slate-500">
        {isSignup
          ? 'Register your details — an administrator will review and approve your access.'
          : 'Sign in to manage your shop floor.'}
      </p>

      <form onSubmit={onSubmit} className="space-y-3.5">
        {isSignup ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <IconField icon={User} label="Full Name" required>
                <input className="input pl-9" value={fullName} onChange={(e) => setFullName(e.target.value)} required aria-label="Full Name" />
              </IconField>
              <IconField icon={Building2} label="Company Name">
                <input className="input pl-9" value={companyName} onChange={(e) => setCompanyName(e.target.value)} aria-label="Company Name" />
              </IconField>
              <IconField icon={Phone} label="Phone">
                <input className="input pl-9" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Phone" />
              </IconField>
              <IconField icon={Mail} label="Email" required>
                <input className="input pl-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" aria-label="Email" />
              </IconField>
            </div>
            <IconField icon={MapPin} label="Address">
              <input className="input pl-9" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Address" />
            </IconField>
            <IconField icon={ReceiptText} label="GSTIN / Tax ID">
              <input className="input pl-9" value={gstin} onChange={(e) => setGstin(e.target.value)} aria-label="GSTIN" />
            </IconField>
            <IconField icon={Lock} label="Password" required>
              <input className="input pl-9" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" placeholder="••••••••" aria-label="Password" />
            </IconField>
            <p className="text-2xs text-slate-500">At least 6 characters.</p>
          </>
        ) : (
          <>
            <IconField icon={supabaseMode ? Mail : User} label={idLabel} required>
              <input
                className="input pl-9"
                type={supabaseMode ? 'email' : 'text'}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete={supabaseMode ? 'email' : 'username'}
                placeholder={supabaseMode ? 'you@example.com' : ''}
                aria-label={idLabel}
                required
              />
            </IconField>
            <IconField icon={Lock} label="Password" required>
              <input
                className="input pl-9"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                aria-label="Password"
                required
              />
            </IconField>
          </>
        )}

        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {isSignup ? 'Submit registration' : 'Sign in'}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500">
        {isSignup ? 'Already have an account? ' : "Don't have an account? "}
        <button
          type="button"
          className="font-semibold text-brand-600 hover:underline"
          onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
        >
          {isSignup ? 'Sign in' : 'Register'}
        </button>
      </p>

      {!supabaseMode && !isSignup && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-center text-2xs text-slate-500">
          Super admin — <b>superadmin</b> / <b>superadmin123</b>
        </p>
      )}
    </div>
  )
}

// Labelled input wrapper with a leading icon.
function IconField({
  icon: Icon,
  label,
  required,
  children,
}: {
  icon: typeof User
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className="relative">
        <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        {children}
      </div>
    </div>
  )
}
