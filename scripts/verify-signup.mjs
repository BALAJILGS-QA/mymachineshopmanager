import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')
const pg = require('pg')

const URL = 'https://ydhvsiixwmbxoumglpvq.supabase.co'
const ANON = process.env.SUPA_ANON
const email = `e2e-signup-check@sreebalajiindustries.com`
const pass = 'Test#12345'

const supabase = createClient(URL, ANON, { auth: { persistSession: false } })

// Simulate the app's register(): signUp, then signIn (trigger auto-confirms).
const { data, error } = await supabase.auth.signUp({ email, password: pass })
let ok = !!data?.session
if (error) console.log('signup error:', error.message)
if (!ok) {
  const { data: d2, error: e2 } = await supabase.auth.signInWithPassword({ email, password: pass })
  ok = !!d2?.session
  if (e2) console.log('signin error:', e2.message)
}
console.log(ok ? 'SIGNUP_FLOW_OK (session established)' : 'SIGNUP_FLOW_FAILED')

// Cleanup the temp user.
const client = new pg.Client({
  host: 'db.ydhvsiixwmbxoumglpvq.supabase.co', port: 5432, user: 'postgres',
  password: process.env.SUPA_DB_PASS, database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
})
await client.connect()
const del = await client.query('delete from auth.users where email = $1', [email])
console.log('cleanup deleted users:', del.rowCount)
await client.end()
