import { useState } from 'react'
import { Cog, Loader2, Lock, User } from 'lucide-react'
import { useAuth } from './auth'
import { useToast } from '@/components/ui/Toast'

export function LoginPage() {
  const { login, supabaseMode } = useAuth()
  const toast = useToast()
  const [username, setUsername] = useState(supabaseMode ? '' : 'admin')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      // Guard against a hung network call so the button always recovers.
      const ok = await Promise.race([
        login(username, password),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15000),
        ),
      ])
      if (!ok) {
        toast.error(supabaseMode ? 'Invalid email or password' : 'Invalid username or password')
      }
    } catch {
      toast.error('Sign-in failed. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-100 to-brand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <Cog size={26} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">CNC Shop Manager</h1>
          <p className="text-sm text-slate-500">Sign in to manage your shop floor</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label">{supabaseMode ? 'Email' : 'Username'}</label>
            <div className="relative">
              <User
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="input pl-9"
                type={supabaseMode ? 'email' : 'text'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder={supabaseMode ? 'you@example.com' : ''}
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <Lock
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="password"
                className="input pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
          {!supabaseMode && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-2xs text-slate-500">
              Default login — <b>admin</b> / <b>admin123</b>. Change it in Settings after first sign-in.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
