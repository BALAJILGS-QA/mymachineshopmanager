// Pure derivation functions. All financial and stock figures are computed here
// from transactional data — never stored denormalised (PRD 13, 6.6, 6.4).

import type {
  Invoice,
  InvoiceComputed,
  Material,
  MaterialIssue,
  MaterialReceipt,
  MaterialReceiptStock,
  MaterialStock,
  Payment,
  StockAdjustment,
} from '@/types'

// Minimal shape the stock derivations read. Any object with these collections
// (the full store, or data assembled from Supabase queries) satisfies it.
export interface StockDb {
  materials: Material[]
  receipts: MaterialReceipt[]
  issues: MaterialIssue[]
  adjustments: StockAdjustment[]
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function invoiceSubtotal(inv: Invoice): number {
  return roundMoney(inv.lines.reduce((sum, l) => sum + l.quantity * l.rate, 0))
}

// Payments allocated to a specific (non-cancelled) invoice.
export function paidForInvoice(invoiceId: string, payments: Payment[]): number {
  return roundMoney(
    payments.filter((p) => p.invoiceId === invoiceId).reduce((sum, p) => sum + p.amount, 0),
  )
}

export function computeInvoice(inv: Invoice, payments: Payment[]): InvoiceComputed {
  const subtotal = invoiceSubtotal(inv)
  const taxable = Math.max(0, subtotal - (inv.discount || 0))
  // Prefer the CGST + SGST split when present; fall back to the combined rate.
  const taxPct =
    inv.cgstPercent != null || inv.sgstPercent != null
      ? (inv.cgstPercent || 0) + (inv.sgstPercent || 0)
      : inv.taxPercent || 0
  const taxAmount = roundMoney((taxable * taxPct) / 100)
  const total = roundMoney(taxable + taxAmount)
  const paid = inv.status === 'Cancelled' ? 0 : paidForInvoice(inv.id, payments)
  const outstanding = inv.status === 'Cancelled' ? 0 : roundMoney(total - paid)
  return { subtotal, taxAmount, total, paid, outstanding }
}

// Derive the effective status from payments (Draft/Cancelled are preserved).
export function deriveInvoiceStatus(inv: Invoice, payments: Payment[]): Invoice['status'] {
  if (inv.status === 'Draft' || inv.status === 'Cancelled') return inv.status
  const { total, paid } = computeInvoice(inv, payments)
  if (paid <= 0) return 'Unpaid'
  if (paid + 0.001 < total) return 'Partially Paid'
  return 'Paid'
}

// Sentinel scope for shop-/self-owned ("own") stock (companyId is null).
export const SHOP_SCOPE = '__shop__'

// Stock balance for a material.
//   scope undefined     → overall (own + all customers)
//   scope SHOP_SCOPE    → own (shop) stock only
//   scope <companyId>   → that customer's stock only
export function materialStock(db: StockDb, materialId: string, companyId?: string): MaterialStock {
  const matchCompany = (cid?: string) =>
    companyId === undefined ? true : companyId === SHOP_SCOPE ? cid == null : cid === companyId

  const received = db.receipts
    .filter((r) => r.materialId === materialId && matchCompany(r.companyId))
    .reduce((s, r) => s + r.quantity, 0)

  const issued = db.issues
    .filter((i) => i.materialId === materialId && matchCompany(i.companyId))
    .reduce((s, i) => s + i.quantity, 0)

  const adjusted = db.adjustments
    .filter((a) => a.materialId === materialId && matchCompany(a.companyId))
    .reduce((s, a) => s + a.quantity, 0)

  return {
    materialId,
    companyId,
    received: roundMoney(received),
    issued: roundMoney(issued),
    adjusted: roundMoney(adjusted),
    balance: roundMoney(received - issued + adjusted),
  }
}

// Per-source stock position for ONE received stock (a material_receipts row).
// Available is computed strictly from movements attributed to THIS receipt
// (source_receipt_id), so two intakes of the same material never merge — the
// pure-TS mirror of the material_receipt_stock DB view. DC and Invoice both
// consume the same source, so both count toward totalDispatched.
export interface ReceiptStock {
  receiptId: string
  received: number
  dcQty: number
  invoiceQty: number
  otherOut: number
  totalDispatched: number
  adjusted: number
  available: number
  status: 'Available' | 'Fully Dispatched'
}

export function receiptStock(db: StockDb, receipt: MaterialReceipt): ReceiptStock {
  const issues = db.issues.filter((i) => i.sourceReceiptId === receipt.id)
  const dcQty = issues
    .filter((i) => i.note?.toLowerCase().includes('challan') ?? false)
    .reduce((s, i) => s + i.quantity, 0)
  const invoiceQty = issues
    .filter((i) => i.note?.toLowerCase().includes('invoice') ?? false)
    .reduce((s, i) => s + i.quantity, 0)
  const totalDispatched = issues.reduce((s, i) => s + i.quantity, 0)
  const otherOut = roundMoney(totalDispatched - dcQty - invoiceQty)
  const adjusted = db.adjustments
    .filter((a) => a.sourceReceiptId === receipt.id)
    .reduce((s, a) => s + a.quantity, 0)
  const available = roundMoney(receipt.quantity - totalDispatched + adjusted)
  return {
    receiptId: receipt.id,
    received: roundMoney(receipt.quantity),
    dcQty: roundMoney(dcQty),
    invoiceQty: roundMoney(invoiceQty),
    otherOut,
    totalDispatched: roundMoney(totalDispatched),
    adjusted: roundMoney(adjusted),
    available,
    status: available <= 0 ? 'Fully Dispatched' : 'Available',
  }
}

// A full per-source stock row (matching the material_receipt_stock DB view)
// derived client-side from a receipt + the movement ledger. Lets the UI show
// source-wise stock without depending on the DB view being present.
export function receiptStockRow(db: StockDb, r: MaterialReceipt): MaterialReceiptStock {
  const s = receiptStock(db, r)
  return {
    receiptId: r.id,
    receiptNo: r.receiptNo,
    date: r.date,
    materialId: r.materialId,
    companyId: r.companyId,
    ownerType: r.ownerType,
    ownership: r.companyId == null ? 'Shop' : 'Company',
    sourceDocNo: r.reference,
    supplier: r.supplier,
    unit: r.unit,
    received: s.received,
    dcQty: s.dcQty,
    invoiceQty: s.invoiceQty,
    otherOut: s.otherOut,
    totalDispatched: s.totalDispatched,
    adjusted: s.adjusted,
    available: s.available,
    status: s.status,
  }
}

// Value of on-hand stock using receipt rates (weighted) — approximate.
export function materialStockValue(db: StockDb, materialId: string): number {
  const receipts = db.receipts.filter((r) => r.materialId === materialId)
  const totalQty = receipts.reduce((s, r) => s + r.quantity, 0)
  if (totalQty === 0) return 0
  const totalValue = receipts.reduce((s, r) => s + r.quantity * (r.rate ?? 0), 0)
  const avgRate = totalValue / totalQty
  const balance = materialStock(db, materialId).balance
  return roundMoney(balance * avgRate)
}

export function totalRawMaterialValue(db: StockDb): number {
  return roundMoney(db.materials.reduce((s, m) => s + materialStockValue(db, m.id), 0))
}

// Value of on-hand stock owned by a specific company, using that company's
// weighted-average receipt rate per material.
export function companyMaterialValue(db: StockDb, companyId: string): number {
  let total = 0
  for (const m of db.materials) {
    const receipts = db.receipts.filter((r) => r.materialId === m.id && r.companyId === companyId)
    const qtyIn = receipts.reduce((s, r) => s + r.quantity, 0)
    if (qtyIn === 0) continue
    const avg = receipts.reduce((s, r) => s + r.quantity * (r.rate ?? 0), 0) / qtyIn
    const balance = materialStock(db, m.id, companyId).balance
    total += balance * avg
  }
  return roundMoney(total)
}

export function jobPendingQty(orderedQty: number, completedQty: number): number {
  return roundMoney(Math.max(0, orderedQty - completedQty))
}
