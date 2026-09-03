// Ad-hoc read-only query runner against Supabase Management API.
// Usage: node scripts/sb-query.mjs "<sql>"   (or pipe SQL via stdin)
import { readFileSync } from 'node:fs'
const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_PROJECT_REF
if (!token || !ref) {
  console.error('Missing env')
  process.exit(1)
}
const query = process.argv[2] ?? readFileSync(0, 'utf8')
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'msm-migrate/1.0',
  },
  body: JSON.stringify({ query }),
})
const text = await res.text()
if (!res.ok) {
  console.error(`HTTP ${res.status}`)
  console.error(text)
  process.exit(1)
}
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2))
} catch {
  console.log(text)
}
