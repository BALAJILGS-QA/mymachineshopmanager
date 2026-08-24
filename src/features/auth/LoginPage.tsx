import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Cog, Loader2, Lock, Mail, User } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from './auth'
import { useToast } from '@/components/ui/Toast'

type Mode = 'signin' | 'signup'

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
      // On success the auth session updates and the router redirects to /app.
    } catch {
      toast.error('Request failed. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-100 to-brand-50 px-4">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-brand-600"
        >
          <ArrowLeft size={14} /> Back to website
        </Link>

        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <Cog size={26} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Sree Balaji Industries</h1>
          <p className="text-sm text-slate-500">
            {isSignup ? 'Create your portal account' : 'Sign in to your portal'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1">
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={clsx(
                'rounded-lg py-1.5 text-sm font-semibold transition',
                mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
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
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {isSignup ? 'Create account' : 'Sign in'}
          </button>

          <p className="text-center text-2xs text-slate-500">
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
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-2xs text-slate-500">
              Default login — <b>admin</b> / <b>admin123</b>. Change it in Settings after first sign-in.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

// Backwards-compatible default export used by the router.
export function LoginPage() {
  return <AuthPage mode="signin" />
}
