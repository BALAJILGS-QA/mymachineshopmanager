// Pure derivation functions. All financial and stock figures are computed here
// from transactional data — never stored denormalised (PRD 13, 6.6, 6.4).

import type {
  Invoice,
  InvoiceComputed,
  MaterialStock,
  Payment,
} from '@/types'
import type { Database } from './db'

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function invoiceSubtotal(inv: Invoice): number {
  return roundMoney(
    inv.lines.reduce((sum, l) => sum + l.quantity * l.rate, 0),
  )
}

// Payments allocated to a specific (non-cancelled) invoice.
export function paidForInvoice(invoiceId: string, payments: Payment[]): number {
  return roundMoney(
    payments
      .filter((p) => p.invoiceId === invoiceId)
      .reduce((sum, p) => sum + p.amount, 0),
  )
}

export function computeInvoice(
  inv: Invoice,
  payments: Payment[],
): InvoiceComputed {
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
export function deriveInvoiceStatus(
  inv: Invoice,
  payments: Payment[],
): Invoice['status'] {
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
export function materialStock(
  db: Database,
  materialId: string,
  companyId?: string,
): MaterialStock {
  const matchCompany = (cid?: string) =>
    companyId === undefined
      ? true
      : companyId === SHOP_SCOPE
      ? cid == null
      : cid === companyId

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

// Value of on-hand stock using receipt rates (weighted) — approximate.
export function materialStockValue(db: Database, materialId: string): number {
  const receipts = db.receipts.filter((r) => r.materialId === materialId)
  const totalQty = receipts.reduce((s, r) => s + r.quantity, 0)
  if (totalQty === 0) return 0
  const totalValue = receipts.reduce(
    (s, r) => s + r.quantity * (r.rate ?? 0),
    0,
  )
  const avgRate = totalValue / totalQty
  const balance = materialStock(db, materialId).balance
  return roundMoney(balance * avgRate)
}

export function totalRawMaterialValue(db: Database): number {
  return roundMoney(
    db.materials.reduce((s, m) => s + materialStockValue(db, m.id), 0),
  )
}

// Value of on-hand stock owned by a specific company, using that company's
// weighted-average receipt rate per material.
export function companyMaterialValue(db: Database, companyId: string): number {
  let total = 0
  for (const m of db.materials) {
    const receipts = db.receipts.filter(
      (r) => r.materialId === m.id && r.companyId === companyId,
    )
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
