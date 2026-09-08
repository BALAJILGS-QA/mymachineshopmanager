// QA-Orchestra — central credential + target resolver.
// Reads from env (populated from .env / CI secrets) with safe fallbacks so the
// suite runs without a local .env in the same shape the existing e2e specs use.
export const QA = {
  email: process.env.QA_EMAIL || process.env.APP_EMAIL || 'balajin04@outlook.com',
  password: process.env.QA_PASSWORD || process.env.APP_PASS || 'QaBalaji@2026',
  username: process.env.QA_USERNAME || 'Balajin',
  /** Target under test. Defaults to live production per the QA-Orchestra config. */
  baseURL: process.env.QA_BASE_URL || 'https://mymachineshopmanager.vercel.app',
  /** Supabase project (public anon values — safe in tests) for token-injection auth. */
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://ydhvsiixwmbxoumglpvq.supabase.co',
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkaHZzaWl4d21ieG91bWdscHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NTMwNjEsImV4cCI6MjEwMzEyOTA2MX0.wmH9Sgq5HCSp8_-GPkq-SVavFYUkeDCcpdBA0H8GVbU',
} as const

/** Supabase project ref parsed from the URL (for the localStorage session key). */
export const SUPABASE_REF =
  (QA.supabaseUrl.match(/https:\/\/([^.]+)\./) || [])[1] || 'ydhvsiixwmbxoumglpvq'

/** Storage-state file produced by e2e/support/auth.setup.ts and reused by every spec. */
export const STORAGE_STATE = 'e2e/.auth/qa.json'
