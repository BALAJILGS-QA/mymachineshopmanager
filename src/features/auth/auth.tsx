// Lightweight local authentication for the MVP. Credentials are never stored in
// the application data tables (PRD 11) — only a salted SHA-256 hash is kept in a
// separate key, and the password default is changeable from Settings. This gates
// the SPA; for a hosted deployment swap this for Supabase Auth.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Role = 'Admin' | 'Shop' | 'Accounts'

interface Session {
  username: string
  role: Role
}

interface AuthApi {
  session: Session | null
  login: (username: string, password: string) => Promise<boolean>
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
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    void ensureDefaultCredential()
  }, [])

  const api = useMemo<AuthApi>(
    () => ({
      session,
      async login(username, password) {
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
      logout() {
        localStorage.removeItem(SESSION_KEY)
        setSession(null)
      },
      async changePassword(current, next) {
        const raw = localStorage.getItem(AUTH_KEY)
        if (!raw) return false
        const cred = JSON.parse(raw) as Credential
        if ((await sha256(current)) !== cred.hash) return false
        cred.hash = await sha256(next)
        localStorage.setItem(AUTH_KEY, JSON.stringify(cred))
        return true
      },
    }),
    [session],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
