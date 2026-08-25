// Full wipe of the Supabase dataset. Signs in with Supabase Auth (the anon key
// + email/password) so it works under the `auth_all` RLS policy without needing
// the Postgres password. Deletes every table child-first (FK-safe) and removes
// the app_state singleton so settings/sequences reset to defaults on next load.
// NO companies are reseeded — a true empty slate.
//
// Credentials are read from the environment (never hard-required in source):
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  — from .env (auto-loaded here)
//   APP_EMAIL / APP_PASS                         — login for the shop account
//
// Usage:  APP_EMAIL=... APP_PASS=... node scripts/clear-all.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// --- Load VITE_* vars from .env (Vite-style file, KEY=value per line) --------
function loadEnv() {
  const out = {}
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env optional if vars are already in process.env */
  }
  return out
}

const fileEnv = loadEnv()
const URL_ = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY
const EMAIL = process.env.APP_EMAIL || 'admin@sreebalajiindustries.com'
const PASS = process.env.APP_PASS || 'Balaji@2026'

if (!URL_ || !KEY) {
  console.error('MISSING_SUPABASE_ENV — set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(2)
}

// Child tables first so foreign keys are never violated. app_state last.
const DATA_TABLES = [
  'production_events',
  'invoice_lines',
  'payments',
  'delivery_challans',
  'expenses',
  'material_issues',
  'material_receipts',
  'stock_adjustments',
  'invoices',
  'job_orders',
  'materials',
  'products',
  'audit_log',
  'companies',
]
const ALL_TABLES = [...DATA_TABLES, 'app_state']

const supabase = createClient(URL_, KEY, { auth: { persistSession: false } })

const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASS })
if (authErr) {
  console.error('LOGIN_FAILED —', authErr.message)
  console.error('Set APP_EMAIL / APP_PASS to the shop login and retry.')
  process.exit(3)
}
console.log('SIGNED_IN as', EMAIL)

async function countOf(t) {
  const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
  return count ?? 0
}

console.log('\n--- Rows before ---')
const before = {}
for (const t of ALL_TABLES) before[t] = await countOf(t)
console.log(before)

console.log('\n--- Deleting (child-first) ---')
for (const t of ALL_TABLES) {
  // neq on a never-used id matches every real row → deletes all.
  const { error } = await supabase.from(t).delete().neq('id', '__never__')
  if (error) {
    console.error(`DELETE_FAILED ${t} —`, error.message)
    process.exit(4)
  }
  console.log(`cleared ${t}`)
}

console.log('\n--- Rows after ---')
const after = {}
for (const t of ALL_TABLES) after[t] = await countOf(t)
console.log(after)

const remaining = Object.values(after).reduce((a, b) => a + b, 0)
console.log(remaining === 0 ? '\nDONE — database is empty.' : `\nWARNING — ${remaining} rows remain.`)
await supabase.auth.signOut()
process.exit(remaining === 0 ? 0 : 5)
