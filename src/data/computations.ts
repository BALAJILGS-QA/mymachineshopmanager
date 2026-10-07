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
  PaymentAllocation,
  PaymentDeduction,
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

// Money applied to a specific (non-cancelled) invoice. Mirrors the SQL
// `invoice_totals.paid` exactly: when allocations are supplied they are the
// source of truth, PLUS any legacy direct-link payment (payments.invoiceId) that
// has no allocation row (old create_payment / bank-import path); with no
// allocations it falls back to the pure direct-link sum (pre-settlement data).
export function paidForInvoice(
  invoiceId: string,
  payments: Payment[],
  allocations: PaymentAllocation[] = [],
): number {
  if (allocations.length) {
    const allocatedPaymentIds = new Set(allocations.map((a) => a.paymentId))
    const fromAllocations = allocations
      .filter((a) => a.invoiceId === invoiceId)
      .reduce((sum, a) => sum + a.amount, 0)
    const legacy = payments
      .filter((p) => p.invoiceId === invoiceId && !allocatedPaymentIds.has(p.id))
      .reduce((sum, p) => sum + p.amount, 0)
    return roundMoney(fromAllocations + legacy)
  }
  return roundMoney(
    payments.filter((p) => p.invoiceId === invoiceId).reduce((sum, p) => sum + p.amount, 0),
  )
}

// Deductions recorded against a specific invoice, split known vs unknown.
export function deductionsForInvoice(
  invoiceId: string,
  deductions: PaymentDeduction[] = [],
): { known: number; unknown: number } {
  let known = 0
  let unknown = 0
  for (const d of deductions) {
    if (d.invoiceId !== invoiceId) continue
    if (d.deductionType === 'Unidentified') unknown += d.amount
    else known += d.amount
  }
  return { known: roundMoney(known), unknown: roundMoney(unknown) }
}

// Full invoice financials. `allocations`/`deductions` are optional: omit them and
// the result is identical to the pre-settlement model (paid via direct links, no
// deductions). Kept bit-identical to the reworked `invoice_totals` SQL view so
// client-derived and server-derived figures never diverge.
export function computeInvoice(
  inv: Invoice,
  payments: Payment[],
  allocations: PaymentAllocation[] = [],
  deductions: PaymentDeduction[] = [],
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
  const cancelled = inv.status === 'Cancelled'
  const paid = cancelled ? 0 : paidForInvoice(inv.id, payments, allocations)
  const { known, unknown } = cancelled
    ? { known: 0, unknown: 0 }
    : deductionsForInvoice(inv.id, deductions)
  const settled = roundMoney(paid + known + unknown)
  const outstanding = cancelled ? 0 : roundMoney(total - settled)
  return {
    subtotal,
    taxAmount,
    total,
    paid,
    outstanding,
    knownDeductions: known,
    unknownDeduction: unknown,
    settled,
  }
}

// Invoice statuses that represent a real, collectible customer sales invoice.
// Draft (not yet issued) and Cancelled/void invoices are excluded from every
// receivables money total.
const ELIGIBLE_INVOICE_STATUSES: ReadonlyArray<Invoice['status']> = [
  'Unpaid',
  'Partially Paid',
  'Paid',
  'Settled',
]

export function isEligibleInvoice(inv: Invoice): boolean {
  return ELIGIBLE_INVOICE_STATUSES.includes(inv.status)
}

function withinRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

export interface ReceivablesFilter {
  companyId?: string
  from?: string // inclusive ISO date
  to?: string // inclusive ISO date
}

export interface ReceivablesSummary {
  totalInvoiced: number
  totalReceived: number
  totalOutstanding: number
  totalAdvances: number
  totalKnownDeductions: number
  totalUnknownDeductions: number
  invoiceCount: number
  paymentCount: number
}

// Accounting-safe receivables roll-up for the Payments dashboard. Derives every
// figure from the authoritative invoice + payment records — nothing is stored
// denormalised — reusing `computeInvoice` (the single source of invoice math) so
// there is no parallel financial logic.
//
//   totalInvoiced    Σ grand total of eligible invoices (issued/posted/paid),
//                    excluding Draft & Cancelled, filtered by INVOICE date.
//   totalReceived    Σ of all valid customer receipts (allocated + advances),
//                    filtered by PAYMENT/receipt date — actual money in.
//   totalOutstanding Σ max(invoiceTotal − paymentsAllocatedToThatInvoice, 0)
//                    over the same eligible invoices. Unallocated advances are
//                    NEVER netted against an invoice they aren't applied to.
//   totalAdvances    Σ of advance / unallocated receipts (no invoice link),
//                    filtered by PAYMENT date — money received but not yet
//                    applied to any invoice.
//
// Company filter constrains all four; date filter uses invoice date for
// invoiced/outstanding and payment date for received/advances (see FILTER docs).
export function receivablesSummary(
  invoices: Invoice[],
  payments: Payment[],
  filter: ReceivablesFilter = {},
  allocations: PaymentAllocation[] = [],
  deductions: PaymentDeduction[] = [],
): ReceivablesSummary {
  const { companyId, from, to } = filter
  const matchCompany = (cid: string) => !companyId || cid === companyId

  let totalInvoiced = 0
  let totalOutstanding = 0
  let totalKnownDeductions = 0
  let totalUnknownDeductions = 0
  let invoiceCount = 0
  for (const inv of invoices) {
    if (!isEligibleInvoice(inv)) continue
    if (!matchCompany(inv.companyId)) continue
    if (!withinRange(inv.date, from, to)) continue
    // `computeInvoice` nets allocations + legacy links + deductions for this
    // invoice; the clamp keeps an over-settled invoice from going negative.
    const c = computeInvoice(inv, payments, allocations, deductions)
    totalInvoiced += c.total
    totalOutstanding += Math.max(c.outstanding, 0)
    totalKnownDeductions += c.knownDeductions
    totalUnknownDeductions += c.unknownDeduction
    invoiceCount += 1
  }

  // Advance = bank money received but NOT applied to any invoice. With
  // allocations present, a payment's advance portion is (amount − Σ its
  // allocations) — this handles partial allocation and excess payments. Without
  // allocations we keep the legacy rule (explicit flag or no invoice link).
  const allocByPayment = new Map<string, number>()
  const hasAllocations = allocations.length > 0
  if (hasAllocations) {
    for (const a of allocations) {
      allocByPayment.set(a.paymentId, (allocByPayment.get(a.paymentId) ?? 0) + a.amount)
    }
  }

  let totalReceived = 0
  let totalAdvances = 0
  let paymentCount = 0
  for (const p of payments) {
    if (!matchCompany(p.companyId)) continue
    if (!withinRange(p.date, from, to)) continue
    totalReceived += p.amount
    paymentCount += 1
    if (hasAllocations) {
      const advancePortion = p.amount - (allocByPayment.get(p.id) ?? 0)
      if (advancePortion > 0.005) totalAdvances += advancePortion
    } else if (p.isAdvance || !p.invoiceId) {
      totalAdvances += p.amount
    }
  }

  return {
    totalInvoiced: roundMoney(totalInvoiced),
    totalReceived: roundMoney(totalReceived),
    totalOutstanding: roundMoney(totalOutstanding),
    totalAdvances: roundMoney(totalAdvances),
    totalKnownDeductions: roundMoney(totalKnownDeductions),
    totalUnknownDeductions: roundMoney(totalUnknownDeductions),
    invoiceCount,
    paymentCount,
  }
}

// Derive the effective status (Draft/Cancelled are preserved). Mirrors the
// recompute in the settlement RPCs:
//   settled ≤ 0                → Unpaid
//   settled < total            → Partially Paid
//   settled ≥ total & paid≥total → Paid    (cash fully covers the invoice)
//   settled ≥ total & paid<total → Settled (closed via deductions, cash < gross)
export function deriveInvoiceStatus(
  inv: Invoice,
  payments: Payment[],
  allocations: PaymentAllocation[] = [],
  deductions: PaymentDeduction[] = [],
): Invoice['status'] {
  if (inv.status === 'Draft' || inv.status === 'Cancelled') return inv.status
  const { total, paid, settled } = computeInvoice(inv, payments, allocations, deductions)
  if (settled <= 0) return 'Unpaid'
  if (settled + 0.001 < total) return 'Partially Paid'
  return paid + 0.001 >= total ? 'Paid' : 'Settled'
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

// ----------------------------------------------------------------------------
// Production material reservation / availability (Phase 3)
// ----------------------------------------------------------------------------
// A production order reserves raw material at planning and consumes (issues) it
// on the floor. These pure helpers derive the per-order picture the DB RPCs
// (material_reserved / material_free / job_material_status) expose, so the UI and
// the server agree on the same math.
//   covered   = reserved (outstanding hold) + consumed (already issued)
//   remaining = how much of the requirement is still uncovered
//   status    = None      → no requirement set
//               Ready     → requirement fully covered
//               Partial   → gap remains but enough FREE stock to cover it
//               Shortage  → gap remains and NOT enough free stock (release-gated)
export type MaterialAvailabilityStatus = 'None' | 'Ready' | 'Partial' | 'Shortage'

export function materialAvailability(
  required: number,
  reserved: number,
  consumed: number,
  free: number,
): { covered: number; remaining: number; status: MaterialAvailabilityStatus } {
  const req = roundMoney(required || 0)
  const covered = roundMoney((reserved || 0) + (consumed || 0))
  const remaining = roundMoney(Math.max(req - covered, 0))
  let status: MaterialAvailabilityStatus
  if (req <= 0) status = 'None'
  else if (covered >= req) status = 'Ready'
  // 1e-6 tolerance so float dust never flips an exactly-coverable line to Shortage.
  else if ((free || 0) + 1e-6 >= remaining) status = 'Partial'
  else status = 'Shortage'
  return { covered, remaining, status }
}

// Outstanding reservation from a set of ledger rows (mirrors the SQL
// material_reserved): Reserve adds, Release/Consume subtract. Pass jobId to scope
// to a single order, omit for the whole material/scope.
export function reservedFromRows(
  rows: { kind: 'Reserve' | 'Release' | 'Consume'; quantity: number; jobId?: string }[],
  jobId?: string,
): number {
  return roundMoney(
    rows
      .filter((r) => (jobId == null ? true : r.jobId === jobId))
      .reduce((s, r) => s + (r.kind === 'Reserve' ? r.quantity : -r.quantity), 0),
  )
}

// ---- Dispatch reconciliation ----------------------------------------------
// Two independent systems record a dispatch: the Finished-Goods ledger (a
// `Dispatch` txn draws stock down — summed as FinishedGoodsBalance.dispatched)
// and the Delivery Challan (the physical document raised to the customer).
// They SHOULD agree per production order; this reconciles them by quantity and
// flags the gaps so nothing ships unrecorded or gets double-counted.
//
//   Matched          → both sides equal and > 0
//   Over-dispatched  → more drawn from FG than challaned (variance > 0)
//   Under-dispatched → challaned more than drawn from FG (variance < 0)
//   No challan       → FG dispatched but no delivery challan raised
//   Not from FG      → challan raised but nothing drawn from Finished Goods
export type DispatchReconStatus =
  'Matched' | 'Over-dispatched' | 'Under-dispatched' | 'No challan' | 'Not from FG'

export interface DispatchReconRow {
  jobId: string
  fgDispatched: number
  challanQty: number
  variance: number // fgDispatched − challanQty
  status: DispatchReconStatus
}

// Challan quantity is attributed to a job per LINE (line.jobId), falling back to
// the challan header jobId. Cancelled challans are excluded. Rows with no
// activity on either side are omitted.
export function dispatchReconciliation(
  fgBalances: { jobId: string; dispatched: number }[],
  challans: {
    jobId?: string
    status: string
    lines: { jobId?: string; quantity: number }[]
  }[],
): DispatchReconRow[] {
  const fgByJob = new Map<string, number>()
  for (const b of fgBalances) {
    if (!b.jobId) continue
    fgByJob.set(b.jobId, roundMoney((fgByJob.get(b.jobId) ?? 0) + (b.dispatched || 0)))
  }

  const challanByJob = new Map<string, number>()
  for (const c of challans) {
    if (c.status === 'Cancelled') continue
    for (const line of c.lines ?? []) {
      const jobId = line.jobId || c.jobId
      if (!jobId) continue
      challanByJob.set(jobId, roundMoney((challanByJob.get(jobId) ?? 0) + (line.quantity || 0)))
    }
  }

  const jobIds = new Set<string>([...fgByJob.keys(), ...challanByJob.keys()])
  const rows: DispatchReconRow[] = []
  for (const jobId of jobIds) {
    const fgDispatched = roundMoney(fgByJob.get(jobId) ?? 0)
    const challanQty = roundMoney(challanByJob.get(jobId) ?? 0)
    if (fgDispatched === 0 && challanQty === 0) continue
    const variance = roundMoney(fgDispatched - challanQty)
    let status: DispatchReconStatus
    if (fgDispatched > 0 && challanQty === 0) status = 'No challan'
    else if (challanQty > 0 && fgDispatched === 0) status = 'Not from FG'
    else if (variance === 0) status = 'Matched'
    else if (variance > 0) status = 'Over-dispatched'
    else status = 'Under-dispatched'
    rows.push({ jobId, fgDispatched, challanQty, variance, status })
  }
  return rows
}

// ---- Labor / utilization aggregation --------------------------------------
// A session's worked minutes: the stored `minutes` once closed, else the live
// elapsed from started_at to `nowMs` for an open session.
export function laborMinutes(
  log: { startedAt: string; endedAt?: string; minutes?: number },
  nowMs: number,
): number {
  if (log.minutes != null && log.endedAt) return Math.max(0, log.minutes)
  const start = new Date(log.startedAt).getTime()
  if (!Number.isFinite(start)) return 0
  return roundMoney(Math.max(0, (nowMs - start) / 60000))
}

export interface LaborSummary {
  totalMin: number
  runMin: number
  downtimeMin: number
  setupMin: number
  byActivity: Record<string, number>
  // keyed rollups (id → minutes); labels resolved by the caller
  byEmployee: Record<string, number>
  byMachine: Record<string, number>
  byDowntimeReason: Record<string, number>
  sessions: number
  openSessions: number
}

export function summarizeLabor(
  logs: {
    employeeId: string
    machineId?: string
    activity: string
    startedAt: string
    endedAt?: string
    minutes?: number
    downtimeReason?: string
  }[],
  nowMs: number,
): LaborSummary {
  const s: LaborSummary = {
    totalMin: 0,
    runMin: 0,
    downtimeMin: 0,
    setupMin: 0,
    byActivity: {},
    byEmployee: {},
    byMachine: {},
    byDowntimeReason: {},
    sessions: logs.length,
    openSessions: 0,
  }
  for (const l of logs) {
    const m = laborMinutes(l, nowMs)
    s.totalMin += m
    if (!l.endedAt) s.openSessions += 1
    s.byActivity[l.activity] = (s.byActivity[l.activity] ?? 0) + m
    s.byEmployee[l.employeeId] = (s.byEmployee[l.employeeId] ?? 0) + m
    if (l.machineId) s.byMachine[l.machineId] = (s.byMachine[l.machineId] ?? 0) + m
    if (l.activity === 'Run') s.runMin += m
    else if (l.activity === 'Downtime') {
      s.downtimeMin += m
      const r = l.downtimeReason || 'Unspecified'
      s.byDowntimeReason[r] = (s.byDowntimeReason[r] ?? 0) + m
    } else if (l.activity === 'Setup') s.setupMin += m
  }
  // round the accumulators
  s.totalMin = roundMoney(s.totalMin)
  s.runMin = roundMoney(s.runMin)
  s.downtimeMin = roundMoney(s.downtimeMin)
  s.setupMin = roundMoney(s.setupMin)
  for (const k of Object.keys(s.byActivity)) s.byActivity[k] = roundMoney(s.byActivity[k])
  for (const k of Object.keys(s.byEmployee)) s.byEmployee[k] = roundMoney(s.byEmployee[k])
  for (const k of Object.keys(s.byMachine)) s.byMachine[k] = roundMoney(s.byMachine[k])
  for (const k of Object.keys(s.byDowntimeReason))
    s.byDowntimeReason[k] = roundMoney(s.byDowntimeReason[k])
  return s
}
