import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, Lock, LogIn, Mail, User } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from './auth'
import { useToast } from '@/components/ui/Toast'

type Mode = 'signin' | 'signup'

// Self-contained auth card (sign in / sign up) embedded in the landing page.
// On an established session it redirects to the portal.
export function AuthForm() {
  const { login, register, session, supabaseMode } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [username, setUsername] = useState(!supabaseMode ? 'admin' : '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'
  const idLabel = supabaseMode ? 'Email' : 'Username'

  useEffect(() => {
    if (session) navigate('/app')
  }, [session, navigate])

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

  if (session) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/90 p-8 text-center shadow-xl shadow-lime-900/10 backdrop-blur">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
          <LogIn size={22} />
        </div>
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="font-semibold text-slate-800">{session.username}</p>
        <button className="btn-primary mt-4 w-full py-2.5" onClick={() => navigate('/app')}>
          Enter Portal <ArrowRight size={16} />
        </button>
      </div>
    )
  }

  return (
    <div
      id="access"
      className="rounded-2xl border border-[var(--line)] bg-white/90 p-6 shadow-xl shadow-lime-900/10 backdrop-blur sm:p-7"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          <LogIn size={16} />
        </span>
        <h2 className="text-lg font-bold text-slate-900">
          {isSignup ? 'Create your account' : 'Welcome back'}
        </h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        {isSignup ? 'Set up access to the management portal.' : 'Sign in to manage your shop floor.'}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
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

      <form onSubmit={onSubmit} className="space-y-3.5">
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

      <p className="mt-4 text-center text-xs text-slate-500">
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
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-center text-2xs text-slate-500">
          Default — <b>admin</b> / <b>admin123</b>
        </p>
      )}
    </div>
  )
}
