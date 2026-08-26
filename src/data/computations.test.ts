import { describe, it, expect } from 'vitest'
import {
  roundMoney,
  invoiceSubtotal,
  paidForInvoice,
  computeInvoice,
  deriveInvoiceStatus,
  materialStock,
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

// ---- jobPendingQty ---------------------------------------------------------

describe('jobPendingQty', () => {
  it('is ordered minus completed, floored at zero', () => {
    expect(jobPendingQty(100, 30)).toBe(70)
    expect(jobPendingQty(100, 120)).toBe(0)
  })
})
