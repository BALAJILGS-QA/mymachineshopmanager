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
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseEnabled } from '@/data/supabase'
import { userRepo, BusinessRuleError } from '@/data/repo'
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
  /** Set when the failure was a CAPTCHA/verification problem (not credentials),
   *  so the UI can reset the widget and ask for re-verification without implying
   *  the password was wrong. */
  captcha?: boolean
}

interface AuthApi {
  session: Session | null
  loading: boolean
  supabaseMode: boolean
  isSuperAdmin: boolean
  login: (username: string, password: string, captchaToken?: string) => Promise<AuthResult>
  register: (input: RegisterInput, captchaToken?: string) => Promise<AuthResult>
  logout: () => void
  changePassword: (current: string, next: string) => Promise<boolean>
}

const AUTH_KEY = 'cnc-shop-auth'
const SESSION_KEY = 'cnc-shop-session'
const SALT = 'cnc-shop::v1'
const DEFAULT_USER = 'superadmin'
const DEFAULT_PASS = 'superadmin123'

// The single super admin (platform operator). Everyone else becomes an Admin of
// their own tenant once approved. Keep this in sync with public.is_super_admin_email
// in the database (migration 0062).
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

// ---- Supabase: the user registry is served by a scoped SECURITY DEFINER RPC -----
// `list_app_users` returns the full list only to a super admin; a normal user gets
// just their OWN record (enough to resolve their login/approval status). The raw
// app_state row is not client-readable, so no user's details leak to another.
async function fetchRemoteUsers(): Promise<AppUser[]> {
  if (!supabase) return []
  const { data } = await supabase.rpc('list_app_users')
  return Array.isArray(data) ? (data as AppUser[]) : []
}

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

  // Tenant/session cache isolation: the React Query cache is shared for the life
  // of the browser tab, so data fetched by one account must never survive into a
  // different account's session. Whenever the authenticated identity changes
  // (login, account switch, or logout → null) drop the ENTIRE query cache so no
  // other tenant's customers/invoices/etc. can be served from a stale cache.
  const queryClient = useQueryClient()
  const prevEmailRef = useRef<string | null>(null)
  useEffect(() => {
    const email = session?.email?.toLowerCase() ?? null
    if (prevEmailRef.current !== null && prevEmailRef.current !== email) {
      queryClient.clear()
    }
    prevEmailRef.current = email
  }, [session?.email, queryClient])

  useEffect(() => {
    if (!supabaseMode) {
      void ensureSuperAdminCredential()
      return
    }
    let active = true
    supabase!.auth.getSession().then(async ({ data }) => {
      if (!active) return
      const resolved = await resolveSupabaseSession(data.session)
      if (!resolved && data.session) await supabase!.auth.signOut()
      if (active) {
        setSession(resolved)
        setLoading(false)
      }
    })
    const { data: sub } = supabase!.auth.onAuthStateChange((_event, s) => {
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

      async login(username, password, captchaToken) {
        if (supabaseMode) {
          const email = username.trim()
          // reCAPTCHA is verified SERVER-SIDE by /api/auth/login BEFORE Supabase
          // is touched (Supabase can't verify reCAPTCHA). On success the route
          // returns a session we install here; the approval gate then runs on it.
          let res: Response
          let data: { session?: { access_token: string; refresh_token: string }; error?: string }
          try {
            res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email, password, captchaToken }),
            })
            data = await res.json().catch(() => ({}))
          } catch {
            return {
              ok: false,
              message: 'Request failed. Please check your connection and try again.',
            }
          }
          if (!res.ok || !data.session) {
            if (data.error === 'captcha_failed') {
              return {
                ok: false,
                captcha: true,
                message: 'Verification failed. Please complete the verification again.',
              }
            }
            if (res.status === 429) {
              return {
                ok: false,
                message: 'Too many attempts. Please wait a minute and try again.',
              }
            }
            if (data.error === 'server_misconfigured') {
              return {
                ok: false,
                message: 'Sign-in is temporarily unavailable. Please try again later.',
              }
            }
            // 401 / anything else — stay generic, never reveal account existence.
            return { ok: false, message: 'Invalid email or password' }
          }
          const { error: setErr } = await supabase!.auth.setSession(data.session)
          if (setErr) return { ok: false, message: 'Invalid email or password' }

          if (isSuperAdminEmail(email)) return { ok: true }
          const users = await fetchRemoteUsers()
          const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase())
          if (!u) {
            await supabase!.auth.signOut()
            return { ok: false, message: 'No registration found for this account.' }
          }
          if (u.status === 'pending') {
            await supabase!.auth.signOut()
            return {
              ok: false,
              pending: true,
              message: 'Your account is awaiting super-admin approval.',
            }
          }
          if (u.status === 'rejected') {
            await supabase!.auth.signOut()
            return {
              ok: false,
              message: 'Your registration was not approved. Please contact the administrator.',
            }
          }
          return { ok: true }
        }

        // Local mode.
        await ensureSuperAdminCredential()
        const uname = username.trim().toLowerCase()
        const hash = await sha256(password)
        const cred = JSON.parse(localStorage.getItem(AUTH_KEY)!) as Credential
        if (uname === cred.username.toLowerCase() && hash === cred.hash) {
          const next: Session = {
            username: cred.username,
            email: cred.username,
            role: 'SuperAdmin',
          }
          localStorage.setItem(SESSION_KEY, JSON.stringify(next))
          setSession(next)
          return { ok: true }
        }
        const u = userRepo.getByEmail(username)
        if (!u) return { ok: false, message: 'Invalid username or password' }
        if (u.status === 'pending')
          return {
            ok: false,
            pending: true,
            message: 'Your account is awaiting super-admin approval.',
          }
        if (u.status === 'rejected')
          return {
            ok: false,
            message: 'Your registration was not approved. Please contact the administrator.',
          }
        if (u.passwordHash !== hash) return { ok: false, message: 'Invalid username or password' }
        const next: Session = { username: u.fullName || u.email, email: u.email, role: 'User' }
        localStorage.setItem(SESSION_KEY, JSON.stringify(next))
        setSession(next)
        return { ok: true }
      },

      async register(input, captchaToken) {
        const email = input.email.trim()
        if (!email) return { ok: false, message: 'Email is required' }
        if (isSuperAdminEmail(email)) return { ok: false, message: 'This email is reserved.' }

        if (supabaseMode) {
          // reCAPTCHA is verified SERVER-SIDE by /api/auth/signup BEFORE Supabase
          // is touched; the route also merges the applicant's profile via the
          // register_pending_user RPC. It does NOT sign the user in (pending
          // approval), so no client session is created here.
          let res: Response
          let data: { ok?: boolean; error?: string; message?: string }
          try {
            res = await fetch('/api/auth/signup', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                email,
                password: input.password,
                fullName: input.fullName.trim(),
                companyName: input.companyName.trim(),
                phone: input.phone.trim(),
                address: input.address.trim(),
                gstin: input.gstin.trim(),
                captchaToken,
              }),
            })
            data = await res.json().catch(() => ({}))
          } catch {
            return {
              ok: false,
              message: 'Request failed. Please check your connection and try again.',
            }
          }
          if (res.ok && data.ok) return { ok: true, pending: true }
          if (data.error === 'captcha_failed') {
            return {
              ok: false,
              captcha: true,
              message: 'Verification failed. Please complete the verification again.',
            }
          }
          if (res.status === 429) {
            return { ok: false, message: 'Too many attempts. Please wait a minute and try again.' }
          }
          return { ok: false, message: data.message || 'Registration failed' }
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
          return {
            ok: false,
            message: e instanceof BusinessRuleError ? e.message : 'Registration failed',
          }
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
