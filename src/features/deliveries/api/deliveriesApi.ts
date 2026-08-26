// Delivery challans data-access - Supabase-direct. Simple CRUD (+ dc_no from the
// server counter); the "invoiced challan cannot be edited/deleted" guard is a DB
// trigger, and reopen (release from a cancelled invoice) is an RPC.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type { DeliveryChallan, DcStatus } from '@/types'

export type DcCreateInput = Omit<DeliveryChallan, 'id' | 'dcNo' | 'createdAt' | 'updatedAt'>
export type DcUpdateInput = Partial<DeliveryChallan>

export async function listChallans(): Promise<DeliveryChallan[]> {
  return selectAll<DeliveryChallan>(maps.deliveryChallans)
}

// Creating a challan atomically dispatches its lines (deducts inventory) via the
// server RPC. Each line must carry materialId + ownerType; the RPC validates
// stock, locks per material, and rolls back everything on any shortfall.
export async function createChallan(input: DcCreateInput): Promise<DeliveryChallan> {
  const { data, error } = await sb().rpc('create_challan_with_dispatch', {
    p_id: uid('dc_'),
    p_dc_no: await nextNumberedDoc('dc'),
    p_date: input.date,
    p_company_id: input.companyId,
    p_job_id: input.jobId ?? null,
    p_reference: input.reference ?? null,
    p_vehicle_no: input.vehicleNo ?? null,
    p_notes: input.notes ?? null,
    p_lines: input.lines,
  })
  if (error) throw error
  return fromRow<DeliveryChallan>((data as Row[])[0], maps.deliveryChallans)
}

// Cancelling reverses the dispatched inventory (compensating adjustments).
export async function cancelChallan(id: string): Promise<DeliveryChallan> {
  const { data, error } = await sb().rpc('cancel_challan', { p_id: id })
  if (error) throw error
  return fromRow<DeliveryChallan>((data as Row[])[0], maps.deliveryChallans)
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
