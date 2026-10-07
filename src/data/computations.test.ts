import { describe, it, expect } from 'vitest'
import {
  roundMoney,
  invoiceSubtotal,
  paidForInvoice,
  computeInvoice,
  deriveInvoiceStatus,
  receivablesSummary,
  materialStock,
  receiptStock,
  jobPendingQty,
  materialAvailability,
  reservedFromRows,
  dispatchReconciliation,
  summarizeLabor,
  laborMinutes,
  SHOP_SCOPE,
} from './computations'
import type {
  Invoice,
  MaterialIssue,
  MaterialReceipt,
  Payment,
  PaymentAllocation,
  PaymentDeduction,
  StockAdjustment,
} from '@/types'
import type { Database } from './db'
import { buildInitialDb } from './seed'

// ---- Test fixtures ---------------------------------------------------------

function invoice(partial: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_1',
    invoiceNo: 'INV-1',
    date: '2026-01-01',
    companyId: 'cmp_1',
    lines: [{ id: 'l1', description: 'Part A', quantity: 10, rate: 100 }],
    discount: 0,
    taxPercent: 0,
    status: 'Unpaid',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

function payment(partial: Partial<Payment> = {}): Payment {
  return {
    id: 'pay_1',
    paymentNo: 'PAY-1',
    date: '2026-01-02',
    companyId: 'cmp_1',
    invoiceId: 'inv_1',
    amount: 100,
    method: 'Cash',
    isAdvance: false,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...partial,
  }
}

// Start from a real, fully-typed empty DB and override only what a test needs.
function makeDb(partial: Partial<Database>): Database {
  return { ...buildInitialDb(), ...partial }
}

// Typed stock-row factories (computations only reads materialId/companyId/quantity;
// the rest are valid defaults so the fixtures type-check).
function rcpt(
  p: Partial<MaterialReceipt> & Pick<MaterialReceipt, 'materialId' | 'quantity'>,
): MaterialReceipt {
  return {
    id: 'r',
    receiptNo: 'R',
    date: '2026-01-01',
    ownerType: 'Shop',
    unit: 'nos',
    createdAt: '',
    updatedAt: '',
    ...p,
  }
}
function iss(
  p: Partial<MaterialIssue> & Pick<MaterialIssue, 'materialId' | 'quantity'>,
): MaterialIssue {
  return {
    id: 'i',
    issueNo: 'I',
    date: '2026-01-01',
    jobId: 'job_1',
    unit: 'nos',
    createdAt: '',
    updatedAt: '',
    ...p,
  }
}
function adj(
  p: Partial<StockAdjustment> & Pick<StockAdjustment, 'materialId' | 'quantity'>,
): StockAdjustment {
  return {
    id: 'a',
    adjNo: 'A',
    date: '2026-01-01',
    unit: 'nos',
    reason: 'test',
    createdAt: '',
    updatedAt: '',
    ...p,
  }
}

// ---- roundMoney ------------------------------------------------------------

describe('roundMoney', () => {
  it('rounds to 2 decimals', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(1.004)).toBe(1.0)
    expect(roundMoney(10 / 3)).toBe(3.33)
  })
})

// ---- invoiceSubtotal -------------------------------------------------------

describe('invoiceSubtotal', () => {
  it('sums quantity * rate across lines', () => {
    const inv = invoice({
      lines: [
        { id: 'a', description: 'x', quantity: 2, rate: 50 },
        { id: 'b', description: 'y', quantity: 3, rate: 10 },
      ],
    })
    expect(invoiceSubtotal(inv)).toBe(130)
  })

  it('is zero for no lines', () => {
    expect(invoiceSubtotal(invoice({ lines: [] }))).toBe(0)
  })
})

// ---- paidForInvoice --------------------------------------------------------

describe('paidForInvoice', () => {
  it('sums only payments allocated to the invoice', () => {
    const payments = [
      payment({ id: 'p1', amount: 100 }),
      payment({ id: 'p2', amount: 50 }),
      payment({ id: 'p3', amount: 999, invoiceId: 'inv_other' }),
    ]
    expect(paidForInvoice('inv_1', payments)).toBe(150)
  })
})

// ---- computeInvoice --------------------------------------------------------

describe('computeInvoice', () => {
  it('computes subtotal/tax/total with a combined tax percent', () => {
    const inv = invoice({ taxPercent: 18 }) // subtotal 1000
    const c = computeInvoice(inv, [])
    expect(c.subtotal).toBe(1000)
    expect(c.taxAmount).toBe(180)
    expect(c.total).toBe(1180)
    expect(c.paid).toBe(0)
    expect(c.outstanding).toBe(1180)
  })

  it('applies discount before tax', () => {
    const inv = invoice({ taxPercent: 10, discount: 100 }) // (1000-100)*1.1
    const c = computeInvoice(inv, [])
    expect(c.taxAmount).toBe(90)
    expect(c.total).toBe(990)
  })

  it('prefers CGST+SGST split over the combined percent', () => {
    const inv = invoice({ taxPercent: 0, cgstPercent: 9, sgstPercent: 9 })
    const c = computeInvoice(inv, [])
    expect(c.taxAmount).toBe(180)
    expect(c.total).toBe(1180)
  })

  it('reflects payments in paid/outstanding', () => {
    const inv = invoice({ taxPercent: 0 }) // total 1000
    const c = computeInvoice(inv, [payment({ amount: 400 })])
    expect(c.paid).toBe(400)
    expect(c.outstanding).toBe(600)
  })

  it('treats cancelled invoices as zero paid/outstanding', () => {
    const inv = invoice({ taxPercent: 18, status: 'Cancelled' })
    const c = computeInvoice(inv, [payment({ amount: 500 })])
    expect(c.paid).toBe(0)
    expect(c.outstanding).toBe(0)
  })
})

// ---- deriveInvoiceStatus ---------------------------------------------------

describe('deriveInvoiceStatus', () => {
  it('preserves Draft and Cancelled', () => {
    expect(deriveInvoiceStatus(invoice({ status: 'Draft' }), [])).toBe('Draft')
    expect(deriveInvoiceStatus(invoice({ status: 'Cancelled' }), [])).toBe('Cancelled')
  })

  it('is Unpaid with no payments', () => {
    expect(deriveInvoiceStatus(invoice({ taxPercent: 0 }), [])).toBe('Unpaid')
  })

  it('is Partially Paid below total', () => {
    const inv = invoice({ taxPercent: 0 }) // total 1000
    expect(deriveInvoiceStatus(inv, [payment({ amount: 500 })])).toBe('Partially Paid')
  })

  it('is Paid at or above total', () => {
    const inv = invoice({ taxPercent: 0 }) // total 1000
    expect(deriveInvoiceStatus(inv, [payment({ amount: 1000 })])).toBe('Paid')
    expect(deriveInvoiceStatus(inv, [payment({ amount: 1200 })])).toBe('Paid')
  })
})

// ---- materialStock ---------------------------------------------------------

describe('materialStock', () => {
  const db = makeDb({
    receipts: [
      rcpt({ materialId: 'm1', quantity: 100 }),
      rcpt({ materialId: 'm1', companyId: 'cmp_1', quantity: 40 }),
    ],
    issues: [
      iss({ materialId: 'm1', quantity: 30 }),
      iss({ materialId: 'm1', companyId: 'cmp_1', quantity: 10 }),
    ],
    adjustments: [adj({ materialId: 'm1', quantity: -5 })],
  })

  it('computes overall balance (own + all customers)', () => {
    // received 140 - issued 40 + adjusted -5 = 95
    expect(materialStock(db, 'm1').balance).toBe(95)
  })

  it('scopes to own (shop) stock only', () => {
    // own: received 100 - issued 30 + adjusted -5 = 65
    const s = materialStock(db, 'm1', SHOP_SCOPE)
    expect(s.balance).toBe(65)
  })

  it('scopes to a specific customer', () => {
    // cmp_1: received 40 - issued 10 = 30
    expect(materialStock(db, 'm1', 'cmp_1').balance).toBe(30)
  })
})

// ---- receiptStock (source-wise stock allocation) ---------------------------
// Mirrors the Delivery-Challan / Customer-Material-Stock business spec: each
// received stock is tracked and reduced independently as it is dispatched via a
// Delivery Challan OR an Invoice (both consume the SAME source).

describe('receiptStock', () => {
  const ESVA = 'cmp_esva'
  // A customer intake of 1,000 Brackets on challan MC-ESVA-001.
  const mc1 = rcpt({
    id: 'rcp_mc1',
    materialId: 'mat_bracket',
    ownerType: 'Company',
    companyId: ESVA,
    quantity: 1000,
    reference: 'MC-ESVA-001',
  })
  // A DC dispatch drawing from a specific source (note carries "challan").
  const dc = (qty: number, id = 'iss_dc', src = mc1.id) =>
    iss({
      id,
      materialId: 'mat_bracket',
      companyId: ESVA,
      quantity: qty,
      sourceReceiptId: src,
      note: `Dispatched via challan DC-00${id}`,
    })
  // An invoice dispatch drawing from a specific source (note carries "invoice").
  const invoiceOut = (qty: number, id = 'iss_inv', src = mc1.id) =>
    iss({
      id,
      materialId: 'mat_bracket',
      companyId: ESVA,
      quantity: qty,
      sourceReceiptId: src,
      note: `Billed via invoice INV-00${id}`,
    })

  it('Test 1: receive 1,000 → available 1,000', () => {
    const db = makeDb({ receipts: [mc1], issues: [], adjustments: [] })
    const s = receiptStock(db, mc1)
    expect(s.received).toBe(1000)
    expect(s.totalDispatched).toBe(0)
    expect(s.available).toBe(1000)
    expect(s.status).toBe('Available')
  })

  it('Test 2: receive 1,000 → DC 500 → available 500', () => {
    const db = makeDb({ receipts: [mc1], issues: [dc(500)], adjustments: [] })
    const s = receiptStock(db, mc1)
    expect(s.dcQty).toBe(500)
    expect(s.totalDispatched).toBe(500)
    expect(s.available).toBe(500)
    expect(s.status).toBe('Available')
  })

  it('Test 3: receive 1,000 → DC 500 → DC 500 → available 0, fully dispatched', () => {
    const db = makeDb({
      receipts: [mc1],
      issues: [dc(500, 'iss_dc1'), dc(500, 'iss_dc2')],
      adjustments: [],
    })
    const s = receiptStock(db, mc1)
    expect(s.dcQty).toBe(1000)
    expect(s.available).toBe(0)
    expect(s.status).toBe('Fully Dispatched')
  })

  it('Test 4: receive 1,000 → Invoice 1,000 → available 0', () => {
    const db = makeDb({ receipts: [mc1], issues: [invoiceOut(1000)], adjustments: [] })
    const s = receiptStock(db, mc1)
    expect(s.invoiceQty).toBe(1000)
    expect(s.available).toBe(0)
    expect(s.status).toBe('Fully Dispatched')
  })

  it('Test 5: receive 1,000 → DC 500 → Invoice 200 → available 300 (DC + Invoice share stock)', () => {
    const db = makeDb({
      receipts: [mc1],
      issues: [dc(500), invoiceOut(200)],
      adjustments: [],
    })
    const s = receiptStock(db, mc1)
    expect(s.dcQty).toBe(500)
    expect(s.invoiceQty).toBe(200)
    expect(s.totalDispatched).toBe(700)
    expect(s.available).toBe(300)
  })

  it('Test 6: over-dispatch is detectable — available never goes negative in the model', () => {
    // 700 already dispatched → 300 available; a 400 request must be rejected.
    const db = makeDb({ receipts: [mc1], issues: [dc(700)], adjustments: [] })
    const s = receiptStock(db, mc1)
    expect(s.available).toBe(300)
    expect(400 > s.available).toBe(true) // backend assert_source_dispatchable rejects this
  })

  it('Test 7: receive 1,000 → DC 500 → edit DC to 300 → available 700', () => {
    // Editing re-syncs the single linked issue to the new quantity (reverse+reapply).
    const db = makeDb({ receipts: [mc1], issues: [dc(300)], adjustments: [] })
    const s = receiptStock(db, mc1)
    expect(s.totalDispatched).toBe(300)
    expect(s.available).toBe(700)
  })

  it('Test 8: receive 1,000 → DC 500 → cancel → available 1,000 (source-attributed reversal)', () => {
    // Cancel keeps the original issue for audit and books a compensating +500
    // adjustment against the SAME source, restoring its available.
    const db = makeDb({
      receipts: [mc1],
      issues: [dc(500)],
      adjustments: [adj({ materialId: 'mat_bracket', quantity: 500, sourceReceiptId: mc1.id })],
    })
    const s = receiptStock(db, mc1)
    expect(s.totalDispatched).toBe(500)
    expect(s.adjusted).toBe(500)
    expect(s.available).toBe(1000)
  })

  it('Test 9: multiple sources stay independent — consume 300 from MC-001 only', () => {
    const mc2 = rcpt({
      id: 'rcp_mc2',
      materialId: 'mat_bracket',
      ownerType: 'Company',
      companyId: ESVA,
      quantity: 500,
      reference: 'MC-ESVA-002',
    })
    const db = makeDb({
      receipts: [mc1, mc2],
      issues: [dc(300, 'iss_dc', mc1.id)],
      adjustments: [],
    })
    expect(receiptStock(db, mc1).available).toBe(700)
    expect(receiptStock(db, mc2).available).toBe(500) // untouched
  })
})

// ---- jobPendingQty ---------------------------------------------------------

describe('jobPendingQty', () => {
  it('is ordered minus completed, floored at zero', () => {
    expect(jobPendingQty(100, 30)).toBe(70)
    expect(jobPendingQty(100, 120)).toBe(0)
  })
})

// ---- receivablesSummary (Payments dashboard KPIs) --------------------------

describe('receivablesSummary', () => {
  // Every fixture invoice defaults to subtotal 1000 (10 × 100), taxPercent 0 →
  // grand total 1000, so amounts read as whole rupees below.

  it('is all-zero with no invoices and no payments', () => {
    expect(receivablesSummary([], [])).toEqual({
      totalInvoiced: 0,
      totalReceived: 0,
      totalOutstanding: 0,
      totalAdvances: 0,
      totalKnownDeductions: 0,
      totalUnknownDeductions: 0,
      invoiceCount: 0,
      paymentCount: 0,
    })
  })

  it('Scenario 1 — one fully paid invoice: outstanding 0', () => {
    const inv = invoice({ id: 'inv_1', status: 'Paid' })
    const pays = [payment({ id: 'p1', invoiceId: 'inv_1', amount: 1000 })]
    const s = receivablesSummary([inv], pays)
    expect(s.totalInvoiced).toBe(1000)
    expect(s.totalReceived).toBe(1000)
    expect(s.totalOutstanding).toBe(0)
    expect(s.totalAdvances).toBe(0)
  })

  it('Scenario 2 — one partially paid invoice: outstanding = remainder', () => {
    const inv = invoice({ id: 'inv_1', status: 'Partially Paid' })
    const pays = [payment({ id: 'p1', invoiceId: 'inv_1', amount: 400 })]
    const s = receivablesSummary([inv], pays)
    expect(s.totalInvoiced).toBe(1000)
    expect(s.totalReceived).toBe(400)
    expect(s.totalOutstanding).toBe(600)
    expect(s.totalAdvances).toBe(0)
  })

  it('sums multiple invoices for the same customer', () => {
    const invs = [
      invoice({ id: 'inv_1', status: 'Paid' }),
      invoice({ id: 'inv_2', status: 'Unpaid' }),
    ]
    const pays = [payment({ id: 'p1', invoiceId: 'inv_1', amount: 1000 })]
    const s = receivablesSummary(invs, pays)
    expect(s.totalInvoiced).toBe(2000)
    expect(s.totalOutstanding).toBe(1000)
    expect(s.invoiceCount).toBe(2)
  })

  it('applies the company filter to all four figures', () => {
    const invs = [
      invoice({ id: 'inv_1', companyId: 'cmp_1', status: 'Unpaid' }),
      invoice({ id: 'inv_2', companyId: 'cmp_2', status: 'Unpaid' }),
    ]
    const pays = [
      payment({ id: 'p1', companyId: 'cmp_1', invoiceId: 'inv_1', amount: 300 }),
      payment({ id: 'p2', companyId: 'cmp_2', invoiceId: 'inv_2', amount: 500 }),
      payment({ id: 'p3', companyId: 'cmp_2', invoiceId: undefined, isAdvance: true, amount: 200 }),
    ]
    const s = receivablesSummary(invs, pays, { companyId: 'cmp_1' })
    expect(s.totalInvoiced).toBe(1000)
    expect(s.totalReceived).toBe(300)
    expect(s.totalOutstanding).toBe(700)
    expect(s.totalAdvances).toBe(0)
  })

  it('filters invoiced/outstanding by invoice date and received by payment date', () => {
    const invs = [
      invoice({ id: 'inv_jan', date: '2026-01-10', status: 'Unpaid' }),
      invoice({ id: 'inv_mar', date: '2026-03-10', status: 'Unpaid' }),
    ]
    const pays = [
      // Received in Feb against the January invoice.
      payment({ id: 'p1', invoiceId: 'inv_jan', date: '2026-02-05', amount: 400 }),
    ]
    const s = receivablesSummary(invs, pays, { from: '2026-01-01', to: '2026-02-28' })
    // Only the January invoice falls in range for invoiced/outstanding.
    expect(s.totalInvoiced).toBe(1000)
    expect(s.totalOutstanding).toBe(600) // 1000 − 400 allocated
    // The Feb payment falls in the received window.
    expect(s.totalReceived).toBe(400)
  })

  it('Scenario 3 — an unallocated advance never reduces invoice outstanding', () => {
    const inv = invoice({ id: 'inv_1', status: 'Unpaid' })
    const pays = [payment({ id: 'p1', invoiceId: undefined, isAdvance: true, amount: 300 })]
    const s = receivablesSummary([inv], pays)
    expect(s.totalInvoiced).toBe(1000)
    expect(s.totalReceived).toBe(300)
    expect(s.totalOutstanding).toBe(1000) // NOT 700
    expect(s.totalAdvances).toBe(300)
  })

  it('treats a payment with no invoice link as an advance even without the flag', () => {
    const pays = [payment({ id: 'p1', invoiceId: undefined, isAdvance: false, amount: 250 })]
    const s = receivablesSummary([], pays)
    expect(s.totalReceived).toBe(250)
    expect(s.totalAdvances).toBe(250)
  })

  it('excludes Draft and Cancelled invoices from invoiced & outstanding', () => {
    const invs = [
      invoice({ id: 'inv_ok', status: 'Unpaid' }),
      invoice({ id: 'inv_draft', status: 'Draft' }),
      invoice({ id: 'inv_void', status: 'Cancelled' }),
    ]
    const s = receivablesSummary(invs, [])
    expect(s.totalInvoiced).toBe(1000)
    expect(s.totalOutstanding).toBe(1000)
    expect(s.invoiceCount).toBe(1)
  })

  it('Scenario 5 — overpayment: invoice square, remainder counts as advance', () => {
    // Modelled as the app records it: the allocated part and the surplus advance
    // are two payment rows.
    const inv = invoice({ id: 'inv_1', status: 'Paid' })
    const pays = [
      payment({ id: 'p1', invoiceId: 'inv_1', amount: 1000 }),
      payment({ id: 'p2', invoiceId: undefined, isAdvance: true, amount: 200 }),
    ]
    const s = receivablesSummary([inv], pays)
    expect(s.totalInvoiced).toBe(1000)
    expect(s.totalReceived).toBe(1200)
    expect(s.totalOutstanding).toBe(0)
    expect(s.totalAdvances).toBe(200)
  })

  it('clamps a single over-allocated invoice to zero outstanding', () => {
    const inv = invoice({ id: 'inv_1', status: 'Paid' })
    const pays = [payment({ id: 'p1', invoiceId: 'inv_1', amount: 1500 })]
    const s = receivablesSummary([inv], pays)
    expect(s.totalOutstanding).toBe(0) // never negative
  })

  it('keeps paise accuracy across many partial receipts', () => {
    const inv = invoice({
      id: 'inv_1',
      status: 'Partially Paid',
      lines: [{ id: 'l', description: 'x', quantity: 1, rate: 100.1 }],
    })
    const pays = [
      payment({ id: 'p1', invoiceId: 'inv_1', amount: 33.37 }),
      payment({ id: 'p2', invoiceId: 'inv_1', amount: 33.37 }),
      payment({ id: 'p3', invoiceId: 'inv_1', amount: 33.36 }),
    ]
    const s = receivablesSummary([inv], pays)
    expect(s.totalInvoiced).toBe(100.1)
    expect(s.totalReceived).toBe(100.1)
    expect(s.totalOutstanding).toBe(0)
  })
})

// ---- Settlement: allocations + deductions + unknown difference -------------

function alloc(partial: Partial<PaymentAllocation> = {}): PaymentAllocation {
  return {
    id: 'pal_1',
    paymentId: 'pay_1',
    invoiceId: 'inv_1',
    amount: 100,
    ...partial,
  }
}

function deduction(partial: Partial<PaymentDeduction> = {}): PaymentDeduction {
  return {
    id: 'ded_1',
    paymentId: 'pay_1',
    invoiceId: 'inv_1',
    deductionType: 'TDS',
    calcType: 'fixed',
    amount: 0,
    ...partial,
  }
}

describe('paidForInvoice — allocation-aware', () => {
  it('sums allocations when present', () => {
    const pays = [payment({ id: 'p1', invoiceId: undefined, amount: 300 })]
    const allocs = [
      alloc({ id: 'a1', paymentId: 'p1', invoiceId: 'inv_1', amount: 120 }),
      alloc({ id: 'a2', paymentId: 'p1', invoiceId: 'inv_2', amount: 180 }),
    ]
    expect(paidForInvoice('inv_1', pays, allocs)).toBe(120)
    expect(paidForInvoice('inv_2', pays, allocs)).toBe(180)
  })

  it('adds legacy direct-link payments that have no allocation row (no double count)', () => {
    // p1 is allocated; p2 is a legacy direct link with no allocation.
    const pays = [
      payment({ id: 'p1', invoiceId: undefined, amount: 100 }),
      payment({ id: 'p2', invoiceId: 'inv_1', amount: 40 }),
    ]
    const allocs = [alloc({ id: 'a1', paymentId: 'p1', invoiceId: 'inv_1', amount: 100 })]
    expect(paidForInvoice('inv_1', pays, allocs)).toBe(140)
  })

  it('falls back to pure direct links when no allocations are supplied', () => {
    const pays = [payment({ id: 'p1', invoiceId: 'inv_1', amount: 70 })]
    expect(paidForInvoice('inv_1', pays)).toBe(70)
  })
})

describe('computeInvoice — deductions & settlement', () => {
  it('known deductions bridge bank-received to gross (invoice fully settled)', () => {
    // Gross 1000; bank 950 allocated; TDS 50 known → settled 1000, outstanding 0.
    const inv = invoice({ id: 'inv_1' })
    const pays = [payment({ id: 'p1', invoiceId: undefined, amount: 950 })]
    const allocs = [alloc({ id: 'a1', paymentId: 'p1', invoiceId: 'inv_1', amount: 950 })]
    const deds = [deduction({ id: 'd1', paymentId: 'p1', deductionType: 'TDS', amount: 50 })]
    const c = computeInvoice(inv, pays, allocs, deds)
    expect(c.paid).toBe(950)
    expect(c.knownDeductions).toBe(50)
    expect(c.unknownDeduction).toBe(0)
    expect(c.settled).toBe(1000)
    expect(c.outstanding).toBe(0)
  })

  it('unknown difference is tracked separately but still closes the invoice', () => {
    const inv = invoice({ id: 'inv_1' })
    const pays = [payment({ id: 'p1', invoiceId: undefined, amount: 950 })]
    const allocs = [alloc({ id: 'a1', paymentId: 'p1', invoiceId: 'inv_1', amount: 950 })]
    const deds = [
      deduction({ id: 'd1', paymentId: 'p1', deductionType: 'Unidentified', amount: 50 }),
    ]
    const c = computeInvoice(inv, pays, allocs, deds)
    expect(c.knownDeductions).toBe(0)
    expect(c.unknownDeduction).toBe(50)
    expect(c.settled).toBe(1000)
    expect(c.outstanding).toBe(0)
  })

  it('no deductions/allocations → identical to the legacy model', () => {
    const inv = invoice({ id: 'inv_1' })
    const pays = [payment({ id: 'p1', invoiceId: 'inv_1', amount: 400 })]
    const c = computeInvoice(inv, pays)
    expect(c.paid).toBe(400)
    expect(c.knownDeductions).toBe(0)
    expect(c.unknownDeduction).toBe(0)
    expect(c.settled).toBe(400)
    expect(c.outstanding).toBe(600)
  })
})

describe('deriveInvoiceStatus — Settled vs Paid', () => {
  const inv = invoice({ id: 'inv_1' }) // gross 1000

  it('cash fully covers → Paid', () => {
    const pays = [payment({ id: 'p1', invoiceId: undefined, amount: 1000 })]
    const allocs = [alloc({ id: 'a1', paymentId: 'p1', amount: 1000 })]
    expect(deriveInvoiceStatus(inv, pays, allocs)).toBe('Paid')
  })

  it('closed via deductions with cash < gross → Settled', () => {
    const pays = [payment({ id: 'p1', invoiceId: undefined, amount: 950 })]
    const allocs = [alloc({ id: 'a1', paymentId: 'p1', amount: 950 })]
    const deds = [deduction({ id: 'd1', paymentId: 'p1', deductionType: 'TDS', amount: 50 })]
    expect(deriveInvoiceStatus(inv, pays, allocs, deds)).toBe('Settled')
  })

  it('partial settlement → Partially Paid', () => {
    const pays = [payment({ id: 'p1', invoiceId: undefined, amount: 400 })]
    const allocs = [alloc({ id: 'a1', paymentId: 'p1', amount: 400 })]
    expect(deriveInvoiceStatus(inv, pays, allocs)).toBe('Partially Paid')
  })
})

describe('ABC Pumps — the canonical spec scenario', () => {
  // INV-1001 100000, INV-1002 75000, INV-1003 50000 → gross 225000.
  // One bank transfer of 220000 allocated across all three; customer gave no
  // deduction breakup → 5000 recorded as Unidentified. All three must settle.
  const inv1 = invoice({
    id: 'inv_1001',
    invoiceNo: 'INV-1001',
    lines: [{ id: 'l', description: 'x', quantity: 1, rate: 100000 }],
  })
  const inv2 = invoice({
    id: 'inv_1002',
    invoiceNo: 'INV-1002',
    lines: [{ id: 'l', description: 'x', quantity: 1, rate: 75000 }],
  })
  const inv3 = invoice({
    id: 'inv_1003',
    invoiceNo: 'INV-1003',
    lines: [{ id: 'l', description: 'x', quantity: 1, rate: 50000 }],
  })
  const pay = payment({ id: 'pay_abc', invoiceId: undefined, amount: 220000, method: 'NEFT' })
  // Allocate bank money proportionally: 100000/75000/45000 = 220000.
  const allocs: PaymentAllocation[] = [
    alloc({ id: 'a1', paymentId: 'pay_abc', invoiceId: 'inv_1001', amount: 100000 }),
    alloc({ id: 'a2', paymentId: 'pay_abc', invoiceId: 'inv_1002', amount: 75000 }),
    alloc({ id: 'a3', paymentId: 'pay_abc', invoiceId: 'inv_1003', amount: 45000 }),
  ]

  it('state 1 — unknown difference of 5000 on INV-1003, it settles', () => {
    const deds: PaymentDeduction[] = [
      deduction({
        id: 'd1',
        paymentId: 'pay_abc',
        invoiceId: 'inv_1003',
        deductionType: 'Unidentified',
        amount: 5000,
      }),
    ]
    const c3 = computeInvoice(inv3, [pay], allocs, deds)
    expect(c3.paid).toBe(45000)
    expect(c3.unknownDeduction).toBe(5000)
    expect(c3.settled).toBe(50000)
    expect(c3.outstanding).toBe(0)
    expect(deriveInvoiceStatus(inv3, [pay], allocs, deds)).toBe('Settled')

    const summary = receivablesSummary([inv1, inv2, inv3], [pay], {}, allocs, deds)
    expect(summary.totalInvoiced).toBe(225000)
    expect(summary.totalReceived).toBe(220000)
    expect(summary.totalOutstanding).toBe(0)
    expect(summary.totalUnknownDeductions).toBe(5000)
    expect(summary.totalKnownDeductions).toBe(0)
    expect(summary.totalAdvances).toBe(0) // whole payment allocated
  })

  it('state 2 — reclassified into TDS 2250 + Transportation 2750, unknown 0', () => {
    const deds: PaymentDeduction[] = [
      deduction({
        id: 'd1',
        paymentId: 'pay_abc',
        invoiceId: 'inv_1003',
        deductionType: 'TDS',
        amount: 2250,
      }),
      deduction({
        id: 'd2',
        paymentId: 'pay_abc',
        invoiceId: 'inv_1003',
        deductionType: 'Transportation',
        amount: 2750,
      }),
    ]
    const c3 = computeInvoice(inv3, [pay], allocs, deds)
    expect(c3.knownDeductions).toBe(5000)
    expect(c3.unknownDeduction).toBe(0)
    expect(c3.settled).toBe(50000)
    expect(c3.outstanding).toBe(0)

    const summary = receivablesSummary([inv1, inv2, inv3], [pay], {}, allocs, deds)
    expect(summary.totalKnownDeductions).toBe(5000)
    expect(summary.totalUnknownDeductions).toBe(0)
    expect(summary.totalOutstanding).toBe(0)
  })
})

describe('multi-payment accrual & partial settlement', () => {
  const inv = invoice({ id: 'inv_1' }) // gross 1000

  it('three separate payments (each allocated) accrue to fully Paid', () => {
    const pays = [
      payment({ id: 'p1', invoiceId: undefined, amount: 400 }),
      payment({ id: 'p2', invoiceId: undefined, amount: 300 }),
      payment({ id: 'p3', invoiceId: undefined, amount: 300 }),
    ]
    const allocs = [
      alloc({ id: 'a1', paymentId: 'p1', invoiceId: 'inv_1', amount: 400 }),
      alloc({ id: 'a2', paymentId: 'p2', invoiceId: 'inv_1', amount: 300 }),
      alloc({ id: 'a3', paymentId: 'p3', invoiceId: 'inv_1', amount: 300 }),
    ]
    const c = computeInvoice(inv, pays, allocs)
    expect(c.paid).toBe(1000)
    expect(c.outstanding).toBe(0)
    expect(deriveInvoiceStatus(inv, pays, allocs)).toBe('Paid')
  })

  it('allocation + known deduction that only partially cover → Partially Paid', () => {
    const pays = [payment({ id: 'p1', invoiceId: undefined, amount: 400 })]
    const allocs = [alloc({ id: 'a1', paymentId: 'p1', invoiceId: 'inv_1', amount: 400 })]
    const deds = [deduction({ id: 'd1', paymentId: 'p1', deductionType: 'TDS', amount: 100 })]
    const c = computeInvoice(inv, pays, allocs, deds)
    expect(c.settled).toBe(500)
    expect(c.outstanding).toBe(500)
    expect(deriveInvoiceStatus(inv, pays, allocs, deds)).toBe('Partially Paid')
  })
})

describe('receivablesSummary — advances from partial/excess allocation', () => {
  it('excess bank money over allocation becomes an advance', () => {
    // Gross 1000; customer pays 1200; allocate 1000, 200 is on-account.
    const inv = invoice({ id: 'inv_1' })
    const pays = [payment({ id: 'p1', invoiceId: undefined, amount: 1200 })]
    const allocs = [alloc({ id: 'a1', paymentId: 'p1', invoiceId: 'inv_1', amount: 1000 })]
    const s = receivablesSummary([inv], pays, {}, allocs)
    expect(s.totalReceived).toBe(1200)
    expect(s.totalOutstanding).toBe(0)
    expect(s.totalAdvances).toBe(200)
  })

  it('a fully unallocated payment is entirely an advance', () => {
    const inv = invoice({ id: 'inv_1' })
    const pays = [
      payment({ id: 'p1', invoiceId: 'inv_1', amount: 400 }),
      payment({ id: 'p2', invoiceId: undefined, amount: 500, isAdvance: true }),
    ]
    const allocs = [alloc({ id: 'a1', paymentId: 'p1', invoiceId: 'inv_1', amount: 400 })]
    const s = receivablesSummary([inv], pays, {}, allocs)
    expect(s.totalAdvances).toBe(500)
    expect(s.totalOutstanding).toBe(600)
  })
})

describe('materialAvailability — production reservation status', () => {
  it('no requirement set → None', () => {
    const r = materialAvailability(0, 0, 0, 500)
    expect(r.status).toBe('None')
    expect(r.remaining).toBe(0)
  })

  it('fully reserved → Ready with zero remaining', () => {
    const r = materialAvailability(1000, 1000, 0, 200)
    expect(r.status).toBe('Ready')
    expect(r.covered).toBe(1000)
    expect(r.remaining).toBe(0)
  })

  it('reserved + consumed together cover the requirement → Ready', () => {
    const r = materialAvailability(1000, 400, 600, 0)
    expect(r.status).toBe('Ready')
    expect(r.covered).toBe(1000)
  })

  it('gap with enough free stock to cover it → Partial', () => {
    const r = materialAvailability(1000, 300, 0, 800)
    expect(r.status).toBe('Partial')
    expect(r.remaining).toBe(700)
  })

  it('gap with insufficient free stock → Shortage', () => {
    const r = materialAvailability(1000, 300, 0, 200)
    expect(r.status).toBe('Shortage')
    expect(r.remaining).toBe(700)
  })

  it('exactly-coverable gap (free == remaining) is Partial, not Shortage', () => {
    const r = materialAvailability(1000, 0, 0, 1000)
    expect(r.status).toBe('Partial')
  })

  it('over-reserved (override) still reads Ready', () => {
    const r = materialAvailability(1000, 1200, 0, -200)
    expect(r.status).toBe('Ready')
    expect(r.remaining).toBe(0)
  })
})

describe('reservedFromRows — outstanding reservation from the ledger', () => {
  const rows = [
    { kind: 'Reserve' as const, quantity: 1000, jobId: 'job_a' },
    { kind: 'Release' as const, quantity: 200, jobId: 'job_a' },
    { kind: 'Consume' as const, quantity: 300, jobId: 'job_a' },
    { kind: 'Reserve' as const, quantity: 500, jobId: 'job_b' },
  ]

  it('nets Reserve − Release − Consume per order', () => {
    expect(reservedFromRows(rows, 'job_a')).toBe(500)
    expect(reservedFromRows(rows, 'job_b')).toBe(500)
  })

  it('sums across all orders when no jobId is given', () => {
    expect(reservedFromRows(rows)).toBe(1000)
  })
})

describe('dispatchReconciliation — FG ledger vs delivery challans', () => {
  it('classifies matched, variance, and one-sided dispatches', () => {
    const fg = [
      { jobId: 'job_match', dispatched: 100 },
      { jobId: 'job_over', dispatched: 120 },
      { jobId: 'job_under', dispatched: 80 },
      { jobId: 'job_nochallan', dispatched: 50 },
      { jobId: 'job_idle', dispatched: 0 },
    ]
    const challans = [
      // matched (line-level jobId)
      { status: 'Open', lines: [{ jobId: 'job_match', quantity: 100 }] },
      // over-dispatched: challan < FG
      { status: 'Open', lines: [{ jobId: 'job_over', quantity: 100 }] },
      // under-dispatched: challan > FG, header jobId fallback
      { jobId: 'job_under', status: 'Open', lines: [{ quantity: 100 }] },
      // not from FG: challan only
      { jobId: 'job_challan_only', status: 'Open', lines: [{ quantity: 30 }] },
      // cancelled challan is ignored entirely
      { jobId: 'job_match', status: 'Cancelled', lines: [{ quantity: 999 }] },
    ]
    const byJob = Object.fromEntries(dispatchReconciliation(fg, challans).map((r) => [r.jobId, r]))

    expect(byJob['job_match']).toMatchObject({
      fgDispatched: 100,
      challanQty: 100,
      status: 'Matched',
    })
    expect(byJob['job_over']).toMatchObject({ variance: 20, status: 'Over-dispatched' })
    expect(byJob['job_under']).toMatchObject({ variance: -20, status: 'Under-dispatched' })
    expect(byJob['job_nochallan']).toMatchObject({ challanQty: 0, status: 'No challan' })
    expect(byJob['job_challan_only']).toMatchObject({ fgDispatched: 0, status: 'Not from FG' })
    // No activity on either side → omitted.
    expect(byJob['job_idle']).toBeUndefined()
  })

  it('sums multiple challan lines/challans for the same job', () => {
    const rows = dispatchReconciliation(
      [{ jobId: 'j1', dispatched: 50 }],
      [
        { jobId: 'j1', status: 'Open', lines: [{ quantity: 20 }, { quantity: 10 }] },
        { jobId: 'j1', status: 'Invoiced', lines: [{ quantity: 20 }] },
      ],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ fgDispatched: 50, challanQty: 50, status: 'Matched' })
  })
})

describe('summarizeLabor — hours/utilization rollup', () => {
  const NOW = new Date('2026-10-08T10:00:00Z').getTime()

  it('uses stored minutes when closed and live elapsed when open', () => {
    const closed = {
      startedAt: '2026-10-08T08:00:00Z',
      endedAt: '2026-10-08T09:00:00Z',
      minutes: 60,
    }
    const open = { startedAt: '2026-10-08T09:30:00Z' } // 30 min to NOW
    expect(laborMinutes(closed, NOW)).toBe(60)
    expect(laborMinutes(open, NOW)).toBe(30)
  })

  it('aggregates by activity, employee, machine and downtime reason', () => {
    const logs = [
      {
        employeeId: 'e1',
        machineId: 'm1',
        activity: 'Run',
        startedAt: '2026-10-08T06:00:00Z',
        endedAt: '2026-10-08T08:00:00Z',
        minutes: 120,
      },
      {
        employeeId: 'e1',
        machineId: 'm1',
        activity: 'Setup',
        startedAt: '2026-10-08T08:00:00Z',
        endedAt: '2026-10-08T08:30:00Z',
        minutes: 30,
      },
      {
        employeeId: 'e2',
        machineId: 'm2',
        activity: 'Downtime',
        startedAt: '2026-10-08T06:00:00Z',
        endedAt: '2026-10-08T06:45:00Z',
        minutes: 45,
        downtimeReason: 'Tool change',
      },
      { employeeId: 'e2', activity: 'Run', startedAt: '2026-10-08T09:00:00Z' }, // open, 60 min
    ]
    const s = summarizeLabor(logs, NOW)
    expect(s.totalMin).toBe(255)
    expect(s.runMin).toBe(180)
    expect(s.setupMin).toBe(30)
    expect(s.downtimeMin).toBe(45)
    expect(s.byEmployee['e1']).toBe(150)
    expect(s.byEmployee['e2']).toBe(105)
    expect(s.byMachine['m1']).toBe(150)
    expect(s.byDowntimeReason['Tool change']).toBe(45)
    expect(s.openSessions).toBe(1)
  })
})
