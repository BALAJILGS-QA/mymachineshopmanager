import { jsPDF } from 'jspdf'
import type { DeliveryChallan } from '@/types'
import { getDb } from '@/data/db'
import { fmtDate, qty } from '@/lib/format'

// Build a clean, text-based (vector) delivery-challan PDF and trigger download.
export function downloadChallanPdf(challanId: string): void {
  const db = getDb()
  const dc: DeliveryChallan | undefined = db.deliveryChallans.find((d) => d.id === challanId)
  if (!dc) return
  const company = db.companies.find((c) => c.id === dc.companyId)
  const shop = db.settings.company

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
  text(shop.name || 'Machine Shop', M, y)
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(150)
  text('DELIVERY CHALLAN', W - M, y, { align: 'right' })

  y += 16
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  const shopLines = [
    shop.address,
    [shop.phone, shop.email].filter(Boolean).join('  |  '),
    shop.gstin ? `GSTIN: ${shop.gstin}` : '',
  ].filter(Boolean)
  shopLines.forEach((l) => {
    text(l as string, M, y)
    y += 12
  })

  // ---- Challan meta (right)
  let ry = 64
  doc.setFontSize(9).setTextColor(90)
  text('DC No', W - M - 160, ry)
  doc.setFont('helvetica', 'bold').setTextColor(30)
  text(dc.dcNo, W - M, ry, { align: 'right' })
  ry += 13
  doc.setFont('helvetica', 'normal').setTextColor(90)
  text('Date', W - M - 160, ry)
  doc.setTextColor(30)
  text(fmtDate(dc.date), W - M, ry, { align: 'right' })
  ry += 13
  doc.setTextColor(90)
  text('Status', W - M - 160, ry)
  doc.setFont('helvetica', 'bold').setTextColor(30)
  text(dc.status, W - M, ry, { align: 'right' })
  if (dc.vehicleNo) {
    ry += 13
    doc.setFont('helvetica', 'normal').setTextColor(90)
    text('Vehicle', W - M - 160, ry)
    doc.setTextColor(30)
    text(dc.vehicleNo, W - M, ry, { align: 'right' })
  }

  y = Math.max(y, ry) + 18
  doc.setDrawColor(220).line(M, y, W - M, y)
  y += 20

  // ---- Ship to
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(120)
  text('SHIP TO', M, y)
  y += 14
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(30)
  text(company?.name ?? '—', M, y)
  y += 13
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  const toLines = [
    company?.billingAddress,
    company?.gstin ? `GSTIN: ${company.gstin}` : '',
    dc.reference ? `Ref: ${dc.reference}` : '',
  ].filter(Boolean) as string[]
  toLines.forEach((l) => {
    text(l, M, y)
    y += 12
  })
  y += 10

  // ---- Items table (no pricing on a challan)
  const cols = { idx: M, desc: M + 26, qty: W - M - 150, unit: W - M }
  doc.setFillColor(244, 246, 250).rect(M, y - 12, W - 2 * M, 20, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(90)
  text('#', cols.idx, y)
  text('DESCRIPTION', cols.desc, y)
  text('QTY', cols.qty, y, { align: 'right' })
  text('UNIT', cols.unit, y, { align: 'right' })
  y += 18

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(40)
  dc.lines.forEach((l, i) => {
    if (y > 760) {
      doc.addPage()
      y = 60
    }
    const desc = doc.splitTextToSize(l.description, cols.qty - cols.desc - 12) as string[]
    text(String(i + 1), cols.idx, y)
    text(desc, cols.desc, y)
    text(qty(l.quantity), cols.qty, y, { align: 'right' })
    text(l.unit || '', cols.unit, y, { align: 'right' })
    y += Math.max(14, desc.length * 12)
    doc.setDrawColor(238).line(M, y - 4, W - M, y - 4)
  })

  // ---- Notes + signature
  if (dc.notes) {
    y += 12
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(120)
    text('NOTES', M, y)
    y += 12
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
    text(doc.splitTextToSize(dc.notes, W - 2 * M) as string[], M, y)
  }

  doc.setFontSize(9).setTextColor(90)
  text('Received in good condition', M, 780)
  text('Authorised Signatory', W - M, 780, { align: 'right' })
  doc.setFontSize(8).setTextColor(160)
  text('This is a computer-generated delivery challan.', W / 2, 812, { align: 'center' })

  doc.save(`${dc.dcNo}.pdf`)
}
