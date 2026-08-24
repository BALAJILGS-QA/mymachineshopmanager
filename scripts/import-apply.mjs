// Imports invoices + payments from Vahinie_Flowra_Consolidated_Report.xlsx into
// Supabase (direct Postgres). Idempotent: rows use deterministic ids and are
// upserted, so re-running does not duplicate. Requires SUPA_DB_PASS.
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const pg = require('pg')

const FILE = 'C:/documents/Vahinie_Flowra_Consolidated_Report.xlsx'
const NOW = new Date().toISOString()
const wb = XLSX.readFile(FILE)

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }
function toISO(v) {
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const m = String(v).match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/)
  if (!m) return null
  const yy = m[3].length === 2 ? '20' + m[3] : m[3]
  return `${yy}-${MONTHS[m[2]] ?? '01'}-${m[1].padStart(2, '0')}`
}
const num = (v) => (typeof v === 'number' ? v : Number(String(v).replace(/[, ]/g, '')) || 0)
const round = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000

// ---- Parse invoices
const invoices = []
for (const sheet of wb.SheetNames.filter((n) => /Invoice Register/.test(n))) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' })
  const hdr = rows.findIndex((r) => String(r[0]).trim() === 'INV No')
  for (const r of rows.slice(hdr + 1)) {
    const inv = r[0], date = toISO(r[1]), company = String(r[2]).trim()
    if (!inv || !date || !company || !/^\d+$/.test(String(inv))) continue
    const amount = num(r[3]), cgst = num(r[4]), sgst = num(r[5])
    invoices.push({ invNo: String(inv), date, company, amount, taxPercent: amount ? round(((cgst + sgst) / amount) * 100) : 0 })
  }
}

// ---- Parse payments
const payments = []
let pi = 0
for (const sheet of wb.SheetNames.filter((n) => /Credit Report/.test(n))) {
  const company = /Vahinie/.test(sheet) ? 'Vahinie Engineering' : /Flowra/.test(sheet) ? 'Flowra Global' : 'Nirmal Pumps'
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' })
  for (const r of rows) {
    const date = toISO(r[0]), credit = num(r[3])
    if (!date || !credit) continue
    payments.push({ id: `pay_imp_${++pi}`, company, date, ref: String(r[2]).trim() || null, particulars: String(r[1]).trim().slice(0, 200), amount: credit })
  }
}

const client = new pg.Client({
  host: 'db.ydhvsiixwmbxoumglpvq.supabase.co', port: 5432, user: 'postgres',
  password: process.env.SUPA_DB_PASS, database: 'postgres',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
})
await client.connect()

// Company name -> id
const { rows: cos } = await client.query('select id, name from companies')
const idByName = Object.fromEntries(cos.map((c) => [c.name, c.id]))
for (const need of ['Flowra Global', 'Vahinie Engineering', 'Nirmal Pumps']) {
  if (!idByName[need]) throw new Error('Missing company: ' + need)
}

let invN = 0, lineN = 0, payN = 0
await client.query('begin')
try {
  for (const v of invoices) {
    const id = `inv_imp_${v.invNo}`
    const invoiceNo = `INV-${String(v.invNo).padStart(3, '0')}`
    await client.query(
      `insert into invoices (id, invoice_no, date, company_id, discount, tax_percent, status, notes, created_at, updated_at)
       values ($1,$2,$3,$4,0,$5,'Unpaid',$6,$7,$7)
       on conflict (id) do update set date=excluded.date, tax_percent=excluded.tax_percent, updated_at=excluded.updated_at`,
      [id, invoiceNo, v.date, idByName[v.company], v.taxPercent, 'Imported from sales register', NOW],
    )
    invN++
    await client.query(
      `insert into invoice_lines (id, invoice_id, description, quantity, rate, line_no)
       values ($1,$2,'Machining charges',1,$3,0)
       on conflict (id) do update set rate=excluded.rate`,
      [`line_imp_${v.invNo}`, id, v.amount],
    )
    lineN++
  }
  for (const p of payments) {
    await client.query(
      `insert into payments (id, payment_no, date, company_id, invoice_id, amount, method, reference, is_advance, notes, created_at, updated_at)
       values ($1,$2,$3,$4,null,$5,'Bank Transfer',$6,true,$7,$8,$8)
       on conflict (id) do update set amount=excluded.amount, date=excluded.date`,
      [p.id, `PAY-IMP-${String(++payN).padStart(3, '0')}`, p.date, idByName[p.company], p.amount, p.ref, p.particulars, NOW],
    )
  }
  await client.query('commit')
} catch (e) {
  await client.query('rollback')
  throw e
}

const inv = await client.query('select count(*)::int n, coalesce(sum(1),0) from invoices')
const pay = await client.query('select count(*)::int n from payments')
console.log(`IMPORTED invoices=${invN} lines=${lineN} payments=${payN}`)
console.log(`DB now: invoices=${inv.rows[0].n} payments=${pay.rows[0].n}`)
await client.end()
