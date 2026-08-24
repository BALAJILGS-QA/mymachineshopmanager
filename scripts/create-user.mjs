import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const URL = 'https://ydhvsiixwmbxoumglpvq.supabase.co'
const ANON = process.env.SUPA_ANON
const PASSWORD = process.env.SUPA_DB_PASS
const REF = 'ydhvsiixwmbxoumglpvq'

// Provide credentials via env: APP_EMAIL / APP_PASS. No secrets in source.
const EMAIL = process.env.APP_EMAIL
const PASS = process.env.APP_PASS
if (!EMAIL || !PASS) {
  console.error('Set APP_EMAIL and APP_PASS environment variables.')
  process.exit(1)
}

const supabase = createClient(URL, ANON)

// 1. Sign up through GoTrue so auth.users + auth.identities are created correctly.
const { error: signErr } = await supabase.auth.signUp({ email: EMAIL, password: PASS })
if (signErr && !/already registered|already exists/i.test(signErr.message)) {
  console.log('SIGNUP_NOTE', signErr.message)
} else {
  console.log('SIGNUP_OK', signErr ? '(existing user)' : '(created)')
}

// 2. Confirm the email via direct SQL so the user can log in immediately.
const client = new pg.Client({
  host: `db.${REF}.supabase.co`, port: 5432, user: 'postgres',
  password: PASSWORD, database: 'postgres',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
})
await client.connect()
const upd = await client.query(
  `update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
   where email = $1 returning id`,
  [EMAIL],
)
console.log('CONFIRMED_ROWS', upd.rowCount)
await client.end()

// 3. Verify sign-in works.
const { data, error: inErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASS })
if (inErr) {
  console.error('SIGNIN_FAIL', inErr.message)
  process.exit(3)
}
console.log('SIGNIN_OK user=', data.user?.email)
