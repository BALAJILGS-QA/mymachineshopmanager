import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Boxes,
  ClipboardList,
  Cog,
  FileText,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from './auth'
import { useToast } from '@/components/ui/Toast'
import '@/features/site/site.css'

type Mode = 'signin' | 'signup'

const HIGHLIGHTS = [
  { icon: ClipboardList, t: 'Job orders', d: 'Track every job from order to dispatch.' },
  { icon: Boxes, t: 'Materials & stock', d: 'Company-wise balances, always current.' },
  { icon: FileText, t: 'Invoices & payments', d: 'Outstanding calculated automatically.' },
]

export function AuthPage({ mode: initialMode = 'signin' }: { mode?: Mode }) {
  const { login, register, supabaseMode } = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [username, setUsername] = useState(!supabaseMode && initialMode === 'signin' ? 'admin' : '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'
  const idLabel = supabaseMode ? 'Email' : 'Username'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSignup && password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setBusy(true)
    try {
      const run: Promise<{ ok: boolean; message?: string }> = isSignup
        ? register(username, password)
        : login(username, password).then((ok) => ({ ok }))
      const result = await Promise.race([
        run,
        new Promise<{ ok: boolean; message?: string }>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15000),
        ),
      ])
      if (!result.ok) {
        toast.error(
          result.message ||
            (isSignup
              ? 'Could not create account'
              : supabaseMode
              ? 'Invalid email or password'
              : 'Invalid username or password'),
        )
      } else if (isSignup) {
        toast.success('Account created — welcome!')
      }
    } catch {
      toast.error('Request failed. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---- Left brand panel (industrial precision) ---- */}
      <aside className="site blueprint relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-96" />
        {/* faint dial motif */}
        <svg
          viewBox="0 0 400 400"
          className="pointer-events-none absolute -right-24 top-1/2 h-[560px] w-[560px] -translate-y-1/2 opacity-20"
          aria-hidden="true"
        >
          <g className="spin-slow" style={{ transformOrigin: '200px 200px' }}>
            <circle cx="200" cy="200" r="150" fill="none" stroke="#3a4657" strokeDasharray="2 12" />
            {Array.from({ length: 12 }).map((_, i) => {
              const a = (i / 12) * Math.PI * 2
              return (
                <line key={i} x1={200 + Math.cos(a) * 156} y1={200 + Math.sin(a) * 156} x2={200 + Math.cos(a) * 174} y2={200 + Math.sin(a) * 174} stroke="#4a5768" strokeWidth="2" />
              )
            })}
          </g>
          <circle cx="200" cy="200" r="110" fill="none" stroke="#ff7a1a" strokeOpacity="0.6" strokeWidth="1.5" />
          <circle cx="200" cy="200" r="66" fill="none" stroke="#4cc4f0" strokeOpacity="0.5" strokeWidth="1.5" />
          <circle cx="200" cy="200" r="12" fill="#ff7a1a" />
        </svg>

        <div className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--amber)] text-[#1a0e04]">
            <Cog size={22} className="spin-slow" />
          </span>
          <span className="leading-none">
            <span className="display block text-base font-bold tracking-tight">SREE BALAJI</span>
            <span className="mono block text-[9px] tracking-[0.3em] text-[var(--ink-dim)]">INDUSTRIES</span>
          </span>
        </div>

        <div className="relative max-w-md">
          <p className="kicker">Client Portal</p>
          <h2 className="display mt-4 text-4xl font-bold leading-[1.05]">
            Run your shop floor with <span className="text-[var(--amber)]">precision.</span>
          </h2>
          <div className="mt-8 space-y-4">
            {HIGHLIGHTS.map((h) => (
              <div key={h.t} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--amber)]/12 text-[var(--amber)] ring-1 ring-[var(--amber)]/25">
                  <h.icon size={17} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{h.t}</p>
                  <p className="text-sm text-[var(--ink-dim)]">{h.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative mono text-[11px] tracking-widest text-[var(--ink-faint)]">
          PRECISION · REPEATABILITY · TRACEABILITY
        </p>
      </aside>

      {/* ---- Right form panel ---- */}
      <main className="relative flex items-center justify-center bg-slate-50 px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between">
            <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-brand-600">
              <ArrowLeft size={14} /> Back to website
            </Link>
            {/* mobile brand mark */}
            <span className="flex items-center gap-1.5 lg:hidden">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-white">
                <Cog size={15} />
              </span>
              <span className="text-sm font-bold text-slate-800">Sree Balaji</span>
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isSignup ? 'Set up access to the management portal.' : 'Sign in to your management portal.'}
          </p>

          {/* Mode toggle */}
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1">
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={clsx(
                  'rounded-lg py-2 text-sm font-semibold transition',
                  mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div>
              <label className="label">{idLabel}</label>
              <div className="relative">
                {supabaseMode ? (
                  <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                ) : (
                  <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                )}
                <input
                  className="input pl-9"
                  type={supabaseMode ? 'email' : 'text'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete={supabaseMode ? 'email' : 'username'}
                  placeholder={supabaseMode ? 'you@example.com' : ''}
                  aria-label={idLabel}
                  autoFocus
                  required
                />
              </div>
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  className="input pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  aria-label="Password"
                  required
                />
              </div>
              {isSignup && <p className="mt-1 text-2xs text-slate-400">At least 6 characters.</p>}
            </div>

            <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              {isSignup ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              className="font-semibold text-brand-600 hover:underline"
              onClick={() => setMode(isSignup ? 'signin' : 'signup')}
            >
              {isSignup ? 'Sign in' : 'Sign up'}
            </button>
          </p>

          {!supabaseMode && !isSignup && (
            <p className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-center text-2xs text-slate-500">
              <ShieldCheck size={13} /> Default — <b>admin</b> / <b>admin123</b>. Change it in Settings.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

// Backwards-compatible export used by the router.
export function LoginPage() {
  return <AuthPage mode="signin" />
}
