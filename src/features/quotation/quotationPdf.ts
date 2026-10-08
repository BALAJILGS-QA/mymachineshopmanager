import { jsPDF } from 'jspdf'
import { computeQuotation, quotationLineNet } from '@/data/computations'
import { imageToPng } from '@/lib/image'
import { fmtDate, qty } from '@/lib/format'
import { getQuotation, listQuotationLines } from './api/quotationApi'
import { listCompanies } from '@/features/companies/api/companiesApi'
import { getSettings } from '@/features/settings/api/settingsApi'

// Standard PDF fonts are Latin-1, which lacks the ₹ glyph — ASCII money formatter.
function money(n: number, symbol: string): string {
  const safe = symbol === '₹' ? 'Rs. ' : /^[\x20-\x7e]+$/.test(symbol) ? symbol : ''
  const s = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n))
  return `${n < 0 ? '-' : ''}${safe}${s}`
}

// Build a clean, text-based (vector) quotation PDF and trigger a download.
export async function downloadQuotationPdf(quotationId: string): Promise<void> {
  const [q, lines, companies, settings] = await Promise.all([
    getQuotation(quotationId),
    listQuotationLines(quotationId),
    listCompanies(),
    getSettings(),
  ])
  if (!q) return
  const company = companies.find((c) => c.id === q.companyId)
  const shop = settings.company
  const sym = settings.currencySymbol
  const c = computeQuotation(q, lines)
  const logo = await imageToPng(shop.logoUrl || '/sbi-logo.svg', 128)

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
  let LX = M
  if (logo) {
    const box = 46
    const scale = Math.min(box / logo.width, box / logo.height)
    doc.addImage(logo.dataUrl, 'PNG', M, 30, logo.width * scale, logo.height * scale)
    LX = M + box + 8
  }
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20)
  text(shop.name || 'CNC Machine Shop', LX, y)
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(150)
  text('QUOTATION', W - M, y, { align: 'right' })

  y += 16
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  ;[
    shop.address,
    [shop.phone, shop.email].filter(Boolean).join('  |  '),
    shop.gstin ? `GSTIN: ${shop.gstin}` : '',
  ]
    .filter(Boolean)
    .forEach((l) => {
      text(l as string, LX, y)
      y += 12
    })

  // ---- Quotation meta (right)
  let ry = 64
  const metaRow = (label: string, val: string) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
    text(label, W - M - 170, ry)
    doc.setFont('helvetica', 'bold').setTextColor(30)
    text(val, W - M, ry, { align: 'right' })
    ry += 13
  }
  metaRow('Quotation No', q.quotationNo + (q.revisionNo > 1 ? ` (Rev ${q.revisionNo})` : ''))
  metaRow('Date', fmtDate(q.quotationDate))
  if (q.expiryDate) metaRow('Valid Until', fmtDate(q.expiryDate))
  metaRow('Status', q.status)

  y = Math.max(y, ry) + 18
  doc.setDrawColor(220).line(M, y, W - M, y)
  y += 20

  // ---- Bill to
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(120)
  text('TO', M, y)
  y += 14
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(30)
  text(company?.name ?? '—', M, y)
  y += 13
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  ;[
    q.billingAddress || company?.billingAddress,
    q.customerGstin ? `GSTIN: ${q.customerGstin}` : '',
    q.contactPerson ? `Attn: ${q.contactPerson}` : '',
    [q.contactPhone, q.contactEmail].filter(Boolean).join('  |  '),
  ]
    .filter(Boolean)
    .forEach((l) => {
      text(l as string, M, y)
      y += 12
    })

  y += 10

  // ---- Line items
  const cols = {
    idx: M,
    desc: M + 22,
    hsn: W - M - 250,
    qty: W - M - 185,
    rate: W - M - 120,
    disc: W - M - 70,
    amt: W - M,
  }
  doc.setFillColor(244, 246, 250).rect(M, y - 12, W - 2 * M, 20, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(90)
  text('#', cols.idx, y)
  text('DESCRIPTION', cols.desc, y)
  text('HSN', cols.hsn, y, { align: 'right' })
  text('QTY', cols.qty, y, { align: 'right' })
  text('RATE', cols.rate, y, { align: 'right' })
  text('DISC%', cols.disc, y, { align: 'right' })
  text('AMOUNT', cols.amt, y, { align: 'right' })
  y += 18

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(40)
  lines.forEach((l, i) => {
    if (y > 720) {
      doc.addPage()
      y = 60
    }
    const label = [l.partNumber, l.description].filter(Boolean).join(' — ')
    const desc = doc.splitTextToSize(label || l.description, cols.hsn - cols.desc - 10) as string[]
    text(String(i + 1), cols.idx, y)
    text(desc, cols.desc, y)
    text(l.hsn || '-', cols.hsn, y, { align: 'right' })
    text(`${qty(l.quantity)}${l.unit ? ' ' + l.unit : ''}`, cols.qty, y, { align: 'right' })
    text(money(l.unitPrice, sym), cols.rate, y, { align: 'right' })
    text(l.discountPercent ? `${l.discountPercent}%` : '-', cols.disc, y, { align: 'right' })
    text(money(quotationLineNet(l), sym), cols.amt, y, { align: 'right' })
    y += Math.max(14, desc.length * 12)
    doc.setDrawColor(238).line(M, y - 4, W - M, y - 4)
  })

  // ---- Totals
  y += 10
  const lx = W - M - 200
  const row = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 9.5)
    doc.setTextColor(bold ? 20 : 90)
    text(label, lx, y)
    doc.setTextColor(bold ? 20 : 40)
    text(val, W - M, y, { align: 'right' })
    y += bold ? 18 : 15
  }
  row('Subtotal', money(c.subtotal, sym))
  if (c.discountTotal > 0) row('Discount', `- ${money(c.discountTotal, sym)}`)
  if (q.packingCharge > 0) row('Packing', money(q.packingCharge, sym))
  if (q.freightCharge > 0) row('Freight', money(q.freightCharge, sym))
  row('Taxable Value', money(c.taxableValue, sym))
  if (c.igstAmount > 0) row(`IGST (${q.igstPercent}%)`, money(c.igstAmount, sym))
  if (c.cgstAmount > 0) row(`CGST (${q.cgstPercent}%)`, money(c.cgstAmount, sym))
  if (c.sgstAmount > 0) row(`SGST (${q.sgstPercent}%)`, money(c.sgstAmount, sym))
  doc.setDrawColor(210).line(lx, y - 4, W - M, y - 4)
  y += 6
  row('Grand Total', money(c.grandTotal, sym), true)

  // ---- Terms
  y += 14
  if (y > 700) {
    doc.addPage()
    y = 60
  }
  doc.setDrawColor(220).line(M, y, W - M, y)
  y += 16
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(120)
  text('TERMS', M, y)
  y += 13
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  ;[
    q.deliveryLeadTime ? `Delivery: ${q.deliveryLeadTime}` : '',
    q.paymentTerms ? `Payment: ${q.paymentTerms}` : '',
    q.advancePercent ? `Advance: ${q.advancePercent}%` : '',
    q.expiryDate ? `Valid until: ${fmtDate(q.expiryDate)}` : '',
  ]
    .filter(Boolean)
    .forEach((l) => {
      text(l as string, M, y)
      y += 12
    })
  if (q.termsConditions) {
    const tc = doc.splitTextToSize(q.termsConditions, W - 2 * M) as string[]
    text(tc, M, y)
    y += tc.length * 12
  }
  if (q.notes) {
    y += 6
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(120)
    text('NOTES', M, y)
    y += 12
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
    const notes = doc.splitTextToSize(q.notes, W - 2 * M) as string[]
    text(notes, M, y)
  }

  // ---- Signatory + footer
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(30)
  text(`For ${shop.name || 'CNC Machine Shop'}`, W - M, 770, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  text(shop.isProprietor ? 'Proprietor' : 'Partner / Authorised Signatory', W - M, 800, {
    align: 'right',
  })
  doc.setFontSize(8).setTextColor(160)
  text('This is a computer-generated quotation.', W / 2, 812, { align: 'center' })

  doc.save(`${q.quotationNo}.pdf`)
}
