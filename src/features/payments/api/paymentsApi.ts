// Payments data-access - Supabase-direct. create/delete run RPCs that also
// recompute the linked invoice's paid/outstanding + status.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type { Payment } from '@/types'

export type PaymentCreateInput = Omit<Payment, 'id' | 'paymentNo' | 'createdAt' | 'updatedAt'>

export async function listPayments(): Promise<Payment[]> {
  return selectAll<Payment>(maps.payments)
}

export async function createPayment(input: PaymentCreateInput): Promise<Payment> {
  const { data, error } = await sb().rpc('create_payment', {
    p_id: uid('pay_'),
    p_payment_no: await nextNumberedDoc('payment'),
    p_date: input.date,
    p_company_id: input.companyId,
    p_invoice_id: input.invoiceId ?? null,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference ?? null,
    p_is_advance: input.isAdvance,
    p_notes: input.notes ?? null,
  })
  if (error) throw error
  return fromRow<Payment>((data as Row[])[0], maps.payments)
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await sb().rpc('delete_payment', { p_id: id })
  if (error) throw error
}
