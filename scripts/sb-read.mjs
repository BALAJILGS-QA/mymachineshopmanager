// Read-only SQL runner against the prod Supabase Postgres (direct pg connection).
// Usage: SUPA_DB_PASS='…' node scripts/sb-read.mjs "select …"   (or pipe SQL via stdin)
// Mirrors apply-migration.mjs connection discovery (direct host then poolers).
import pg from 'pg'
import { readFileSync } from 'node:fs'

const PASSWORD = process.env.SUPA_DB_PASS
const REF = 'ydhvsiixwmbxoumglpvq'
if (!PASSWORD) {
  console.error('Set SUPA_DB_PASS and re-run.')
  process.exit(1)
}
const sql = process.argv[2] ?? readFileSync(0, 'utf8')

const regions = ['ap-south-1', 'ap-southeast-1', 'us-east-1', 'eu-central-1', 'eu-west-1']
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
    console.error('CONNECTED via', c.name)
    break
  } catch (e) {
    console.error('fail', c.name, '-', e.code || e.message)
  }
}
if (!client) {
  console.error('NO_CONNECTION')
  process.exit(2)
}
try {
  const res = await client.query(sql)
  console.log(JSON.stringify(res.rows, null, 2))
} catch (e) {
  console.error('QUERY_ERROR', e.message)
  process.exit(3)
} finally {
  await client.end()
}
