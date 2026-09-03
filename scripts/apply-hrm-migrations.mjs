// One-off: apply the HRM migrations to Supabase via the Management API.
// Usage: node scripts/apply-hrm-migrations.mjs [file1.sql file2.sql ...]
// Requires SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF in the environment
// (source .env.deploy.local first). Idempotent migrations — safe to re-run.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_PROJECT_REF
if (!token || !ref) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const migDir = resolve(here, '..', 'supabase', 'migrations')
const files =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ['0019_hrm_foundation.sql', '0020_hrm_core.sql', '0021_hrm_payroll_extras.sql']

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`

async function runSql(query, label) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'msm-migrate/1.0',
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text, label }
}

for (const f of files) {
  const path = f.includes('/') || f.includes('\\') ? f : join(migDir, f)
  const sql = await readFile(path, 'utf8')
  process.stdout.write(`\n▶ Applying ${f} (${sql.length} bytes)… `)
  const r = await runSql(sql, f)
  if (r.ok) {
    console.log(`OK (${r.status})`)
  } else {
    console.log(`FAILED (${r.status})`)
    console.error(r.text.slice(0, 2000))
    process.exit(1)
  }
}
console.log('\n✅ All migrations applied.')
