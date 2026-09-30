// Settlement data-access — Supabase-direct. The settlement layer records a
// payment together with its multi-invoice allocations and optional deductions
// (TDS/freight/… and the unknown-difference bucket) in ONE atomic RPC
// (create_settlement). Allocating an existing advance to invoices is a second
// RPC (allocate_advance). Row ids are minted client-side, matching create_invoice.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type {
  DeductionCalcType,
  DeductionType,
  Payment,
  PaymentAllocation,
  PaymentDeduction,
  PaymentMethod,
} from '@/types'

export interface SettlementAllocationInput {
  invoiceId: string
  amount: number
}

export interface SettlementDeductionInput {
  invoiceId?: string
  deductionType: DeductionType
  calcType?: DeductionCalcType
  rate?: number
  amount: number
  reference?: string
  remarks?: string
}

export interface SettlementCreateInput {
  date: string
  companyId: string
  amount: number
  method: PaymentMethod
  reference?: string
  notes?: string
  allocations: SettlementAllocationInput[]
  deductions: SettlementDeductionInput[]
}

export async function listAllocations(): Promise<PaymentAllocation[]> {
  return selectAll<PaymentAllocation>(maps.paymentAllocations)
}

export async function listDeductions(): Promise<PaymentDeduction[]> {
  return selectAll<PaymentDeduction>(maps.paymentDeductions)
}

function allocationRows(allocations: SettlementAllocationInput[]) {
  return allocations.map((a) => ({
    id: uid('pal_'),
    invoice_id: a.invoiceId,
    amount: a.amount,
  }))
}

export async function createSettlement(input: SettlementCreateInput): Promise<Payment> {
  const { data, error } = await sb().rpc('create_settlement', {
    p_id: uid('pay_'),
    p_payment_no: await nextNumberedDoc('payment'),
    p_date: input.date,
    p_company_id: input.companyId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
    p_allocations: allocationRows(input.allocations),
    p_deductions: input.deductions.map((d) => ({
      id: uid('ded_'),
      invoice_id: d.invoiceId ?? null,
      deduction_type: d.deductionType,
      calc_type: d.calcType ?? 'fixed',
      rate: d.rate ?? null,
      amount: d.amount,
      reference: d.reference ?? null,
      remarks: d.remarks ?? null,
    })),
  })
  if (error) throw error
  return fromRow<Payment>((data as Row[])[0], maps.payments)
}

// Apply an already-recorded advance / on-account receipt to one or more invoices.
export async function allocateAdvance(
  paymentId: string,
  allocations: SettlementAllocationInput[],
): Promise<void> {
  const { error } = await sb().rpc('allocate_advance', {
    p_payment_id: paymentId,
    p_allocations: allocationRows(allocations),
  })
  if (error) throw error
}

export interface DeductionSplitInput {
  deductionType: DeductionType
  calcType?: DeductionCalcType
  rate?: number
  amount: number
  reference?: string
  remarks?: string
}

// Convert an invoice's recorded 'Unidentified' difference into known deductions.
// The split total must equal the unknown amount (enforced server-side); settled
// stays the same, only the classification changes (audited).
export async function reclassifyDeduction(
  paymentId: string,
  invoiceId: string,
  splits: DeductionSplitInput[],
): Promise<void> {
  const { error } = await sb().rpc('reclassify_deduction', {
    p_payment_id: paymentId,
    p_invoice_id: invoiceId,
    p_splits: splits.map((s) => ({
      id: uid('ded_'),
      deduction_type: s.deductionType,
      calc_type: s.calcType ?? 'fixed',
      rate: s.rate ?? null,
      amount: s.amount,
      reference: s.reference ?? null,
      remarks: s.remarks ?? null,
    })),
  })
  if (error) throw error
}
