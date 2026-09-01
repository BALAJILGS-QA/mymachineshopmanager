// Apply a single SQL migration file to the Supabase Postgres database.
//
// Usage (run in YOUR terminal so the password is never stored):
//   SUPA_DB_PASS='your-db-password' node scripts/apply-migration.mjs supabase/migrations/0015_source_stock_allocation.sql
//
// Defaults to the 0015 source-stock-allocation migration when no path is given.
// The migration is idempotent (create or replace / if not exists), so it is safe
// to re-run. Mirrors run-schema.mjs: tries the direct host then every pooler
// region until one connects.

import pg from 'pg'
import { readFileSync } from 'node:fs'

const PASSWORD = process.env.SUPA_DB_PASS
const REF = 'ydhvsiixwmbxoumglpvq'
const file = process.argv[2] || 'supabase/migrations/0015_source_stock_allocation.sql'

if (!PASSWORD) {
  console.error('Set SUPA_DB_PASS to your Supabase database password and re-run.')
  process.exit(1)
}

const sql = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const regions = [
  'ap-south-1',
  'ap-southeast-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'eu-central-1',
  'eu-west-1',
  'ap-northeast-1',
  'ap-southeast-2',
]

const candidates = [
  {
    name: 'direct-ipv6',
    config: { host: `db.${REF}.supabase.co`, port: 5432, user: 'postgres', database: 'postgres' },
  },
  ...regions.flatMap((r) => [
    {
      name: `pooler-session-${r}`,
      config: {
        host: `aws-0-${r}.pooler.supabase.com`,
        port: 5432,
        user: `postgres.${REF}`,
        database: 'postgres',
      },
    },
    {
      name: `pooler-txn-${r}`,
      config: {
        host: `aws-0-${r}.pooler.supabase.com`,
        port: 6543,
        user: `postgres.${REF}`,
        database: 'postgres',
      },
    },
  ]),
]

async function tryConnect(c) {
  const client = new pg.Client({
    ...c.config,
    password: PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 120000,
  })
  await client.connect()
  return client
}

let client = null
for (const c of candidates) {
  try {
    client = await tryConnect(c)
    console.log('CONNECTED via', c.name)
    break
  } catch (e) {
    console.log('fail', c.name, '-', e.code || e.message)
  }
}

if (!client) {
  console.error('NO_CONNECTION')
  process.exit(2)
}

try {
  console.log('Applying', file, '…')
  // Run the whole migration in one transaction so a failure rolls back cleanly.
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  console.log('MIGRATION_APPLIED')

  // Smoke-check the objects 0015 creates (harmless for other migrations).
  const view = await client.query("select to_regclass('public.material_receipt_stock') as v")
  const fn = await client.query(
    "select count(*)::int as n from pg_proc where proname = 'receipt_available'",
  )
  console.log('material_receipt_stock view:', view.rows[0].v ?? 'absent')
  console.log('receipt_available function:', fn.rows[0].n > 0 ? 'present' : 'absent')
} catch (e) {
  try {
    await client.query('rollback')
  } catch {
    /* ignore */
  }
  console.error('MIGRATION_ERROR', e.message)
  process.exit(3)
} finally {
  await client.end()
}
