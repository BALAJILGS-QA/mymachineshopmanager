import { jsPDF } from 'jspdf'
import type { Invoice } from '@/types'
import { getDb } from '@/data/db'
import { computeInvoice } from '@/data/computations'
import { fmtDate, qty } from '@/lib/format'

// Standard PDF fonts are Latin-1, which lacks the ₹ glyph — use an ASCII money
// formatter so amounts render correctly regardless of the configured symbol.
function money(n: number, symbol: string): string {
  const safe = symbol === '₹' ? 'Rs. ' : /^[\x20-\x7e]+$/.test(symbol) ? symbol : ''
  const s = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n))
  return `${n < 0 ? '-' : ''}${safe}${s}`
}

// Build a clean, text-based (vector) invoice PDF and trigger a download.
export function downloadInvoicePdf(invoiceId: string): void {
  const db = getDb()
  const inv: Invoice | undefined = db.invoices.find((i) => i.id === invoiceId)
  if (!inv) return
  const company = db.companies.find((c) => c.id === inv.companyId)
  const shop = db.settings.company
  const sym = db.settings.currencySymbol
  const c = computeInvoice(inv, db.payments)

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 40
  let y = 48

  const text = (
    s: string | string[],
    x: number,
    yy: number,
    opts?: { align?: 'left' | 'right' | 'center' },
  ) => doc.text(s, x, yy, opts)

  // ---- Shop header
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20)
  text(shop.name || 'CNC Machine Shop', M, y)
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(150)
  text('INVOICE', W - M, y, { align: 'right' })

  y += 16
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  const shopLines = [shop.address, [shop.phone, shop.email].filter(Boolean).join('  |  '), shop.gstin ? `GSTIN: ${shop.gstin}` : '']
    .filter(Boolean)
  shopLines.forEach((l) => { text(l, M, y); y += 12 })

  // ---- Invoice meta (right)
  let ry = 64
  doc.setFontSize(9).setTextColor(90)
  text('Invoice No', W - M - 150, ry); doc.setFont('helvetica', 'bold').setTextColor(30)
  text(inv.invoiceNo, W - M, ry, { align: 'right' }); ry += 13
  doc.setFont('helvetica', 'normal').setTextColor(90)
  text('Date', W - M - 150, ry); doc.setTextColor(30)
  text(fmtDate(inv.date), W - M, ry, { align: 'right' }); ry += 13
  doc.setTextColor(90)
  text('Status', W - M - 150, ry); doc.setFont('helvetica', 'bold').setTextColor(30)
  text(inv.status, W - M, ry, { align: 'right' })

  y = Math.max(y, ry) + 18
  doc.setDrawColor(220).line(M, y, W - M, y)
  y += 20

  // ---- Bill to
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(120)
  text('BILL TO', M, y)
  y += 14
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(30)
  text(company?.name ?? '—', M, y)
  y += 13
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  const billLines = [inv.billingAddress || company?.billingAddress, company?.gstin ? `GSTIN: ${company.gstin}` : '', inv.reference ? `Ref: ${inv.reference}` : '']
    .filter(Boolean) as string[]
  billLines.forEach((l) => { text(l, M, y); y += 12 })

  y += 10

  // ---- Line items table
  const cols = { idx: M, desc: M + 26, qty: W - M - 200, rate: W - M - 110, amt: W - M }
  doc.setFillColor(244, 246, 250).rect(M, y - 12, W - 2 * M, 20, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(90)
  text('#', cols.idx, y)
  text('DESCRIPTION', cols.desc, y)
  text('QTY', cols.qty, y, { align: 'right' })
  text('RATE', cols.rate, y, { align: 'right' })
  text('AMOUNT', cols.amt, y, { align: 'right' })
  y += 18

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(40)
  inv.lines.forEach((l, i) => {
    if (y > 740) { doc.addPage(); y = 60 }
    const desc = doc.splitTextToSize(l.description, cols.qty - cols.desc - 12) as string[]
    text(String(i + 1), cols.idx, y)
    text(desc, cols.desc, y)
    text(qty(l.quantity), cols.qty, y, { align: 'right' })
    text(money(l.rate, sym), cols.rate, y, { align: 'right' })
    text(money(l.quantity * l.rate, sym), cols.amt, y, { align: 'right' })
    y += Math.max(14, desc.length * 12)
    doc.setDrawColor(238).line(M, y - 4, W - M, y - 4)
  })

  // ---- Totals
  y += 10
  const lx = W - M - 190
  const row = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 9.5)
    doc.setTextColor(bold ? 20 : 90)
    text(label, lx, y)
    doc.setTextColor(bold ? 20 : 40)
    text(val, W - M, y, { align: 'right' })
    y += bold ? 18 : 15
  }
  row('Subtotal', money(c.subtotal, sym))
  if (inv.discount > 0) row('Discount', `- ${money(inv.discount, sym)}`)
  if (inv.taxPercent > 0) row(`Tax (${inv.taxPercent}%)`, money(c.taxAmount, sym))
  doc.setDrawColor(210).line(lx, y - 4, W - M, y - 4); y += 6
  row('Total', money(c.total, sym), true)
  if (c.paid > 0) {
    row('Paid', money(c.paid, sym))
    row('Outstanding', money(c.outstanding, sym), true)
  }

  // ---- Notes + footer
  if (inv.notes) {
    y += 10
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(120)
    text('NOTES', M, y); y += 12
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
    const notes = doc.splitTextToSize(inv.notes, W - 2 * M) as string[]
    text(notes, M, y)
  }
  doc.setFontSize(8).setTextColor(160)
  text('This is a computer-generated invoice.', W / 2, 812, { align: 'center' })

  doc.save(`${inv.invoiceNo}.pdf`)
}
