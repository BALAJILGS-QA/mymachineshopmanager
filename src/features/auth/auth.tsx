// Authentication. Two modes:
//  • Supabase mode (VITE_SUPABASE_* set) — real email/password auth via
//    Supabase Auth so Postgres RLS grants access only to signed-in users.
//  • Local mode — a salted SHA-256 admin credential kept in localStorage,
//    never in the data tables (PRD 11). Gates the static SPA at zero cost.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase, isSupabaseEnabled } from '@/data/supabase'

export type Role = 'Admin' | 'Shop' | 'Accounts'

interface Session {
  username: string
  role: Role
}

interface AuthResult {
  ok: boolean
  message?: string
}

interface AuthApi {
  session: Session | null
  loading: boolean
  supabaseMode: boolean
  login: (username: string, password: string) => Promise<boolean>
  register: (username: string, password: string) => Promise<AuthResult>
  logout: () => void
  changePassword: (current: string, next: string) => Promise<boolean>
}

const AUTH_KEY = 'cnc-shop-auth'
const SESSION_KEY = 'cnc-shop-session'
const SALT = 'cnc-shop::v1'
const DEFAULT_USER = 'admin'
const DEFAULT_PASS = 'admin123'

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

interface Credential {
  username: string
  hash: string
  role: Role
}

async function ensureDefaultCredential(): Promise<void> {
  if (!localStorage.getItem(AUTH_KEY)) {
    const cred: Credential = {
      username: DEFAULT_USER,
      hash: await sha256(DEFAULT_PASS),
      role: 'Admin',
    }
    localStorage.setItem(AUTH_KEY, JSON.stringify(cred))
  }
}

const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabaseMode = isSupabaseEnabled()
  const [session, setSession] = useState<Session | null>(() => {
    if (supabaseMode) return null
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(supabaseMode)

  useEffect(() => {
    if (!supabaseMode) {
      void ensureDefaultCredential()
      return
    }
    let active = true
    supabase!.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session ? { username: data.session.user.email ?? 'user', role: 'Admin' } : null)
      setLoading(false)
    })
    const { data: sub } = supabase!.auth.onAuthStateChange((_event, s) => {
      setSession(s ? { username: s.user.email ?? 'user', role: 'Admin' } : null)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [supabaseMode])

  const api = useMemo<AuthApi>(
    () => ({
      session,
      loading,
      supabaseMode,
      async login(username, password) {
        if (supabaseMode) {
          const { error } = await supabase!.auth.signInWithPassword({
            email: username.trim(),
            password,
          })
          return !error
        }
        await ensureDefaultCredential()
        const raw = localStorage.getItem(AUTH_KEY)
        if (!raw) return false
        const cred = JSON.parse(raw) as Credential
        const hash = await sha256(password)
        if (
          username.trim().toLowerCase() === cred.username.toLowerCase() &&
          hash === cred.hash
        ) {
          const next: Session = { username: cred.username, role: cred.role }
          localStorage.setItem(SESSION_KEY, JSON.stringify(next))
          setSession(next)
          return true
        }
        return false
      },
      async register(username, password) {
        if (supabaseMode) {
          const email = username.trim()
          const { data, error } = await supabase!.auth.signUp({ email, password })
          if (error) return { ok: false, message: error.message }
          if (data.session) return { ok: true }
          // No session returned — new users are auto-confirmed by a DB trigger,
          // so sign in immediately to establish the session.
          const { error: e2 } = await supabase!.auth.signInWithPassword({ email, password })
          if (e2) return { ok: false, message: 'Account created. Please sign in.' }
          return { ok: true }
        }
        // Local mode: create/replace the single admin credential and sign in.
        const cred: Credential = {
          username: username.trim() || DEFAULT_USER,
          hash: await sha256(password),
          role: 'Admin',
        }
        localStorage.setItem(AUTH_KEY, JSON.stringify(cred))
        const next: Session = { username: cred.username, role: cred.role }
        localStorage.setItem(SESSION_KEY, JSON.stringify(next))
        setSession(next)
        return { ok: true }
      },
      logout() {
        if (supabaseMode) {
          void supabase!.auth.signOut()
          return
        }
        localStorage.removeItem(SESSION_KEY)
        setSession(null)
      },
      async changePassword(current, next) {
        if (supabaseMode) {
          const { error } = await supabase!.auth.updateUser({ password: next })
          return !error
        }
        const raw = localStorage.getItem(AUTH_KEY)
        if (!raw) return false
        const cred = JSON.parse(raw) as Credential
        if ((await sha256(current)) !== cred.hash) return false
        cred.hash = await sha256(next)
        localStorage.setItem(AUTH_KEY, JSON.stringify(cred))
        return true
      },
    }),
    [session, loading, supabaseMode],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
