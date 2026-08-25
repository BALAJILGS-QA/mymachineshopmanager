// Authentication with a registration-approval gate.
//  • Super admin: a dedicated login with full access. It approves new sign-ups.
//  • New users register with their details and land as 'pending' — they CANNOT
//    enter the app until the super admin approves them.
//
// Two backends:
//  • Supabase mode — email/password via Supabase Auth. Profiles + approval state
//    live in the app_state JSON blob (no extra table). The super admin is any
//    email in SUPER_ADMIN_EMAILS.
//  • Local mode — a salted SHA-256 super-admin credential in localStorage;
//    registered users (with approval state) live in the local data store.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase, isSupabaseEnabled } from '@/data/supabase'
import { userRepo, BusinessRuleError } from '@/data/repo'
import { uid } from '@/lib/id'
import type { AppUser } from '@/types'

export type Role = 'SuperAdmin' | 'User'

interface Session {
  username: string
  email: string
  role: Role
}

export interface RegisterInput {
  email: string
  password: string
  fullName: string
  companyName: string
  phone: string
  address: string
  gstin: string
}

interface AuthResult {
  ok: boolean
  message?: string
  pending?: boolean
}

interface AuthApi {
  session: Session | null
  loading: boolean
  supabaseMode: boolean
  isSuperAdmin: boolean
  login: (username: string, password: string) => Promise<AuthResult>
  register: (input: RegisterInput) => Promise<AuthResult>
  logout: () => void
  changePassword: (current: string, next: string) => Promise<boolean>
}

const AUTH_KEY = 'cnc-shop-auth'
const SESSION_KEY = 'cnc-shop-session'
const SALT = 'cnc-shop::v1'
const DEFAULT_USER = 'superadmin'
const DEFAULT_PASS = 'superadmin123'

// Emails treated as super admins in Supabase mode (full access + approvals).
const SUPER_ADMIN_EMAILS = ['admin@sreebalajiindustries.com']
function isSuperAdminEmail(email?: string | null): boolean {
  return !!email && SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === email.toLowerCase())
}

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

async function ensureSuperAdminCredential(): Promise<void> {
  if (!localStorage.getItem(AUTH_KEY)) {
    const cred: Credential = {
      username: DEFAULT_USER,
      hash: await sha256(DEFAULT_PASS),
      role: 'SuperAdmin',
    }
    localStorage.setItem(AUTH_KEY, JSON.stringify(cred))
  }
}

// ---- Supabase: profiles live in app_state.data.users (no extra table) -------
async function fetchRemoteUsers(): Promise<AppUser[]> {
  if (!supabase) return []
  const { data } = await supabase.from('app_state').select('data').eq('id', 'singleton').maybeSingle()
  const users = (data?.data as { users?: AppUser[] } | null)?.users
  return Array.isArray(users) ? users : []
}

async function appendRemoteUser(user: AppUser): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.from('app_state').select('data').eq('id', 'singleton').maybeSingle()
  const cur = (data?.data as Record<string, unknown> | null) ?? {}
  const users = (Array.isArray((cur as { users?: AppUser[] }).users)
    ? (cur as { users: AppUser[] }).users
    : []) as AppUser[]
  if (users.some((u) => u.email.toLowerCase() === user.email.toLowerCase())) return
  users.push(user)
  const { error } = await supabase.from('app_state').upsert({ id: 'singleton', data: { ...cur, users } })
  if (error) throw error
}

// While a registration is in flight we briefly hold a session to write the
// profile; suppress the approval gate so it isn't signed out mid-write.
let suppressGate = false

async function resolveSupabaseSession(
  s: { user: { email?: string | null } } | null,
): Promise<Session | null> {
  if (!s) return null
  const email = s.user.email ?? ''
  if (isSuperAdminEmail(email)) return { username: email, email, role: 'SuperAdmin' }
  const users = await fetchRemoteUsers()
  const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase())
  if (u && u.status === 'approved') return { username: u.fullName || email, email, role: 'User' }
  return null
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
      void ensureSuperAdminCredential()
      return
    }
    let active = true
    supabase!.auth.getSession().then(async ({ data }) => {
      if (!active) return
      const resolved = await resolveSupabaseSession(data.session)
      if (!resolved && data.session && !suppressGate) await supabase!.auth.signOut()
      if (active) {
        setSession(resolved)
        setLoading(false)
      }
    })
    const { data: sub } = supabase!.auth.onAuthStateChange((_event, s) => {
      if (suppressGate) return
      resolveSupabaseSession(s).then((resolved) => {
        if (!resolved && s) void supabase!.auth.signOut()
        setSession(resolved)
      })
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
      isSuperAdmin: session?.role === 'SuperAdmin',

      async login(username, password) {
        if (supabaseMode) {
          const email = username.trim()
          const { error } = await supabase!.auth.signInWithPassword({ email, password })
          if (error) return { ok: false, message: 'Invalid email or password' }
          if (isSuperAdminEmail(email)) return { ok: true }
          const users = await fetchRemoteUsers()
          const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase())
          if (!u) {
            await supabase!.auth.signOut()
            return { ok: false, message: 'No registration found for this account.' }
          }
          if (u.status === 'pending') {
            await supabase!.auth.signOut()
            return { ok: false, pending: true, message: 'Your account is awaiting super-admin approval.' }
          }
          if (u.status === 'rejected') {
            await supabase!.auth.signOut()
            return { ok: false, message: 'Your registration was not approved. Please contact the administrator.' }
          }
          return { ok: true }
        }

        // Local mode.
        await ensureSuperAdminCredential()
        const uname = username.trim().toLowerCase()
        const hash = await sha256(password)
        const cred = JSON.parse(localStorage.getItem(AUTH_KEY)!) as Credential
        if (uname === cred.username.toLowerCase() && hash === cred.hash) {
          const next: Session = { username: cred.username, email: cred.username, role: 'SuperAdmin' }
          localStorage.setItem(SESSION_KEY, JSON.stringify(next))
          setSession(next)
          return { ok: true }
        }
        const u = userRepo.getByEmail(username)
        if (!u) return { ok: false, message: 'Invalid username or password' }
        if (u.status === 'pending')
          return { ok: false, pending: true, message: 'Your account is awaiting super-admin approval.' }
        if (u.status === 'rejected')
          return { ok: false, message: 'Your registration was not approved. Please contact the administrator.' }
        if (u.passwordHash !== hash) return { ok: false, message: 'Invalid username or password' }
        const next: Session = { username: u.fullName || u.email, email: u.email, role: 'User' }
        localStorage.setItem(SESSION_KEY, JSON.stringify(next))
        setSession(next)
        return { ok: true }
      },

      async register(input) {
        const email = input.email.trim()
        if (!email) return { ok: false, message: 'Email is required' }
        if (isSuperAdminEmail(email)) return { ok: false, message: 'This email is reserved.' }

        if (supabaseMode) {
          suppressGate = true
          try {
            const { data, error } = await supabase!.auth.signUp({ email, password: input.password })
            if (error) return { ok: false, message: error.message }
            if (!data.session) {
              const { error: e2 } = await supabase!.auth.signInWithPassword({
                email,
                password: input.password,
              })
              if (e2) return { ok: false, message: 'Account created. Please ask the admin to approve you, then sign in.' }
            }
            const existing = await fetchRemoteUsers()
            if (existing.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
              return { ok: false, message: 'An account with this email already exists.' }
            }
            const user: AppUser = {
              id: uid('usr_'),
              email,
              fullName: input.fullName.trim(),
              companyName: input.companyName.trim(),
              phone: input.phone.trim(),
              address: input.address.trim(),
              gstin: input.gstin.trim(),
              role: 'User',
              status: 'pending',
              createdAt: new Date().toISOString(),
            }
            await appendRemoteUser(user)
            return { ok: true, pending: true }
          } catch (e) {
            return { ok: false, message: e instanceof Error ? e.message : 'Registration failed' }
          } finally {
            await supabase!.auth.signOut()
            suppressGate = false
            setSession(null)
          }
        }

        // Local mode — store a pending user; do NOT sign in.
        try {
          const hash = await sha256(input.password)
          userRepo.register({
            email,
            fullName: input.fullName.trim(),
            companyName: input.companyName.trim(),
            phone: input.phone.trim(),
            address: input.address.trim(),
            gstin: input.gstin.trim(),
            passwordHash: hash,
          })
          return { ok: true, pending: true }
        } catch (e) {
          return { ok: false, message: e instanceof BusinessRuleError ? e.message : 'Registration failed' }
        }
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
        const curHash = await sha256(current)
        // Super admin credential.
        const cred = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null') as Credential | null
        if (session?.role === 'SuperAdmin' && cred) {
          if (curHash !== cred.hash) return false
          cred.hash = await sha256(next)
          localStorage.setItem(AUTH_KEY, JSON.stringify(cred))
          return true
        }
        // Registered user.
        if (session?.email) {
          const u = userRepo.getByEmail(session.email)
          if (!u || u.passwordHash !== curHash) return false
          userRepo.update(u.id, { passwordHash: await sha256(next) })
          return true
        }
        return false
      },
    }),
    [session, loading, supabaseMode],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
