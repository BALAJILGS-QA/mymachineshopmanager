// Delivery challans data-access - Supabase-direct. Simple CRUD (+ dc_no from the
// server counter); the "invoiced challan cannot be edited/deleted" guard is a DB
// trigger, and reopen (release from a cancelled invoice) is an RPC.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type { DeliveryChallan, DcStatus } from '@/types'

export type DcCreateInput = Omit<DeliveryChallan, 'id' | 'dcNo' | 'createdAt' | 'updatedAt'>
export type DcUpdateInput = Partial<DeliveryChallan>

export async function listChallans(): Promise<DeliveryChallan[]> {
  return selectAll<DeliveryChallan>(maps.deliveryChallans)
}

export async function createChallan(input: DcCreateInput): Promise<DeliveryChallan> {
  return insertRow<DeliveryChallan>(maps.deliveryChallans, {
    ...input,
    id: uid('dc_'),
    dcNo: await nextNumberedDoc('dc'),
    status: input.status ?? 'Open',
  })
}

export async function updateChallan(id: string, patch: DcUpdateInput): Promise<DeliveryChallan> {
  return updateRow<DeliveryChallan>(maps.deliveryChallans, id, patch)
}

export async function deleteChallan(id: string): Promise<void> {
  return deleteRow(maps.deliveryChallans, id)
}

export async function setChallanStatus(
  id: string,
  status: DcStatus,
  invoiceId?: string,
): Promise<DeliveryChallan> {
  const patch: DcUpdateInput = { status }
  if (invoiceId !== undefined) patch.invoiceId = invoiceId
  return updateRow<DeliveryChallan>(maps.deliveryChallans, id, patch)
}

export async function reopenChallan(id: string): Promise<DeliveryChallan> {
  const { data, error } = await sb().rpc('reopen_challan', { p_id: id })
  if (error) throw error
  return fromRow<DeliveryChallan>((data as Row[])[0], maps.deliveryChallans)
}
