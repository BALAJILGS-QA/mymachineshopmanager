import { describe, it, expect } from 'vitest'
import {
  roundMoney,
  invoiceSubtotal,
  paidForInvoice,
  computeInvoice,
  deriveInvoiceStatus,
  materialStock,
  receiptStock,
  jobPendingQty,
  SHOP_SCOPE,
} from './computations'
import type { Invoice, MaterialIssue, MaterialReceipt, Payment, StockAdjustment } from '@/types'
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
