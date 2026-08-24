// Dry-run parser for Vahinie_Flowra_Consolidated_Report.xlsx.
// Reports what would be imported as Invoices and Payments. No DB writes unless
// APPLY=1 (handled by a separate step after review).
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const FILE = 'C:/documents/Vahinie_Flowra_Consolidated_Report.xlsx'
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

// ---- Invoices from the 4 monthly registers
const invoices = []
for (const sheet of wb.SheetNames.filter((n) => /Invoice Register/.test(n))) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' })
  const hdr = rows.findIndex((r) => String(r[0]).trim() === 'INV No')
  for (const r of rows.slice(hdr + 1)) {
    const inv = r[0], date = toISO(r[1]), company = String(r[2]).trim()
    if (!inv || !date || !company) continue
    if (!/^\d+$/.test(String(inv))) continue
    const amount = num(r[3]), cgst = num(r[4]), sgst = num(r[5]), total = num(r[6])
    invoices.push({ invNo: String(inv), date, company, amount, cgst, sgst, total })
  }
}

// ---- Payments from the 3 credit reports
const payments = []
for (const sheet of wb.SheetNames.filter((n) => /Credit Report/.test(n))) {
  const company = /Vahinie/.test(sheet) ? 'Vahinie Engineering' : /Flowra/.test(sheet) ? 'Flowra Global' : 'Nirmal Pumps'
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' })
  for (const r of rows) {
    const date = toISO(r[0])
    const credit = num(r[3])
    if (!date || !credit) continue
    payments.push({ company, date, ref: String(r[2]).trim(), particulars: String(r[1]).trim(), amount: credit })
  }
}

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0)
const byCompany = (arr, amtFn) => {
  const m = {}
  arr.forEach((x) => (m[x.company] = (m[x.company] || 0) + amtFn(x)))
  return m
}

console.log('=== INVOICES ===', invoices.length)
console.log('by company (total incl tax):', byCompany(invoices, (i) => i.total))
console.log('date range:', invoices.map((i) => i.date).sort()[0], '→', invoices.map((i) => i.date).sort().at(-1))
console.log('samples:', JSON.stringify(invoices.slice(0, 3)))
console.log('\n=== PAYMENTS ===', payments.length)
console.log('by company:', byCompany(payments, (p) => p.amount))
console.log('date range:', payments.map((p) => p.date).sort()[0], '→', payments.map((p) => p.date).sort().at(-1))
console.log('total received:', sum(payments, (p) => p.amount))
console.log('samples:', JSON.stringify(payments.slice(0, 3)))
