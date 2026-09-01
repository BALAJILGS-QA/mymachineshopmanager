// Subcontracting (job work) — Supabase-direct. The order is a plain row; the two
// stock-affecting legs run server RPCs (create_subcontract_dispatch / _return)
// so the delivery challan and the return receipt/expense are atomic with the
// order-quantity updates.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextCode, nextNumberedDoc } from '@/lib/api/numbering'
import type { PaymentMethod, SubcontractDoc, SubcontractOrder } from '@/types'

export type SubcontractCreateInput = Omit<
  SubcontractOrder,
  'id' | 'scNo' | 'sentQty' | 'receivedQty' | 'rejectedQty' | 'status' | 'createdAt' | 'updatedAt'
>
export type SubcontractUpdateInput = Partial<SubcontractOrder>

export async function listOrders(): Promise<SubcontractOrder[]> {
  return selectAll<SubcontractOrder>(maps.subcontractOrders)
}

export async function listDocs(scId: string): Promise<SubcontractDoc[]> {
  const { data, error } = await sb()
    .from('subcontract_docs')
    .select('*')
    .eq('sc_id', scId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<SubcontractDoc>(r as Row, maps.subcontractDocs))
}

export async function createOrder(input: SubcontractCreateInput): Promise<SubcontractOrder> {
  const scNo = await nextCode('subcontract', 'SC-', 4)
  return insertRow<SubcontractOrder>(maps.subcontractOrders, {
    ...input,
    id: uid('sc_'),
    scNo,
    sentQty: 0,
    receivedQty: 0,
    rejectedQty: 0,
    status: 'Open',
  })
}

export async function updateOrder(
  id: string,
  patch: SubcontractUpdateInput,
): Promise<SubcontractOrder> {
  return updateRow<SubcontractOrder>(maps.subcontractOrders, id, patch)
}

export async function deleteOrder(id: string): Promise<void> {
  return deleteRow(maps.subcontractOrders, id)
}

// Outward: send material to the vendor on our delivery challan (deducts stock).
export async function dispatch(
  scId: string,
  input: { date: string; quantity: number; notes?: string },
): Promise<SubcontractOrder> {
  const docNo = await nextCode('sc_out', 'SCO-', 4)
  const { data, error } = await sb().rpc('create_subcontract_dispatch', {
    p_doc_id: uid('scd_'),
    p_doc_no: docNo,
    p_sc_id: scId,
    p_date: input.date,
    p_quantity: input.quantity,
    p_notes: input.notes ?? null,
    p_issue_id: uid('iss_'),
    p_issue_no: `${docNo}/iss`,
  })
  if (error) throw error
  return fromRow<SubcontractOrder>((data as Row[])[0], maps.subcontractOrders)
}

// Inward: vendor returns processed material on their DC / job-work invoice.
export async function receive(
  scId: string,
  input: {
    date: string
    docKind: 'DC' | 'INVOICE'
    vendorRef?: string
    quantity: number
    rejected?: number
    amount?: number
    method?: PaymentMethod
    notes?: string
  },
): Promise<SubcontractOrder> {
  const docNo = await nextCode('sc_in', 'SCI-', 4)
  const { data, error } = await sb().rpc('create_subcontract_return', {
    p_doc_id: uid('scd_'),
    p_doc_no: docNo,
    p_sc_id: scId,
    p_date: input.date,
    p_doc_kind: input.docKind,
    p_vendor_ref: input.vendorRef ?? null,
    p_quantity: input.quantity,
    p_rejected: input.rejected ?? 0,
    p_amount: input.amount ?? null,
    p_method: input.method ?? 'Cash',
    p_notes: input.notes ?? null,
    p_receipt_id: uid('rcp_'),
    p_receipt_no: `${docNo}/rcp`,
    p_expense_id: uid('exp_'),
    p_expense_no: input.docKind === 'INVOICE' ? await nextNumberedDoc('expense') : `${docNo}/exp`,
  })
  if (error) throw error
  return fromRow<SubcontractOrder>((data as Row[])[0], maps.subcontractOrders)
}
