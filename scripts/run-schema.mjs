import pg from 'pg'
import { readFileSync } from 'node:fs'

const PASSWORD = process.env.SUPA_DB_PASS
const REF = 'ydhvsiixwmbxoumglpvq'
const sql = readFileSync(new URL('../docs/supabase-schema.sql', import.meta.url), 'utf8')

const regions = [
  'ap-south-1', 'ap-southeast-1', 'us-east-1', 'us-east-2', 'us-west-1',
  'eu-central-1', 'eu-west-1', 'ap-northeast-1', 'ap-southeast-2',
]

const candidates = [
  { name: 'direct-ipv6', config: { host: `db.${REF}.supabase.co`, port: 5432, user: 'postgres', database: 'postgres' } },
  ...regions.flatMap((r) => [
    { name: `pooler-session-${r}`, config: { host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${REF}`, database: 'postgres' } },
    { name: `pooler-txn-${r}`, config: { host: `aws-0-${r}.pooler.supabase.com`, port: 6543, user: `postgres.${REF}`, database: 'postgres' } },
  ]),
]

async function tryConnect(c) {
  const client = new pg.Client({
    ...c.config,
    password: PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 60000,
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
  await client.query(sql)
  console.log('SCHEMA_APPLIED')
  const r = await client.query('select count(*)::int as n from companies')
  console.log('companies_count', r.rows[0].n)
} catch (e) {
  console.error('SCHEMA_ERROR', e.message)
  process.exit(3)
} finally {
  await client.end()
}
