// Delivery challans data-access - Supabase-direct. Simple CRUD (+ dc_no from the
// server counter); the "invoiced challan cannot be edited/deleted" guard is a DB
// trigger, and reopen (release from a cancelled invoice) is an RPC.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type { DeliveryChallan, DcStatus } from '@/types'

// `dcNo` is optional: when a caller supplies one (manual entry) it is used as-is;
// otherwise the next sequential number is minted from the server counter.
export type DcCreateInput = Omit<DeliveryChallan, 'id' | 'dcNo' | 'createdAt' | 'updatedAt'> & {
  dcNo?: string
}
export type DcUpdateInput = Partial<DeliveryChallan>

export async function listChallans(): Promise<DeliveryChallan[]> {
  return selectAll<DeliveryChallan>(maps.deliveryChallans)
}

// Creating a challan atomically dispatches its lines (deducts inventory) via the
// server RPC. Each line must carry materialId + ownerType; the RPC validates
// stock, locks per material, and rolls back everything on any shortfall.
export async function createChallan(input: DcCreateInput): Promise<DeliveryChallan> {
  // Manual number wins when provided; otherwise mint the next sequential one.
  const dcNo = input.dcNo?.trim() || (await nextNumberedDoc('dc'))
  const { data, error } = await sb().rpc('create_challan_with_dispatch', {
    p_id: uid('dc_'),
    p_dc_no: dcNo,
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

// Correct the dispatched quantities on an Open challan. The RPC re-syncs stock
// (updates the linked material_issues) and rewrites the lines atomically. Only
// quantities change here — materials are fixed (add/remove needs cancel+recreate).
export async function updateChallanQuantities(
  id: string,
  patch: {
    reference?: string
    vehicleNo?: string
    notes?: string
    lines: DeliveryChallan['lines']
  },
): Promise<DeliveryChallan> {
  const { data, error } = await sb().rpc('update_challan_quantities', {
    p_id: id,
    p_reference: patch.reference ?? null,
    p_vehicle_no: patch.vehicleNo ?? null,
    p_notes: patch.notes ?? null,
    p_lines: patch.lines,
  })
  if (error) throw error
  return fromRow<DeliveryChallan>((data as Row[])[0], maps.deliveryChallans)
}

// Full edit of an Open challan: every field is editable (company, date, job,
// reference, vehicle, notes) and materials can be added/removed/swapped. The RPC
// reverses the old dispatch and re-posts fresh issues, so stock is re-synced
// atomically. Rejected server-side for invoiced/cancelled challans.
export async function updateChallanFull(
  id: string,
  patch: {
    date: string
    companyId: string
    jobId?: string
    reference?: string
    vehicleNo?: string
    notes?: string
    lines: DeliveryChallan['lines']
  },
): Promise<DeliveryChallan> {
  const { data, error } = await sb().rpc('update_challan_full', {
    p_id: id,
    p_date: patch.date,
    p_company_id: patch.companyId,
    p_job_id: patch.jobId ?? null,
    p_reference: patch.reference ?? null,
    p_vehicle_no: patch.vehicleNo ?? null,
    p_notes: patch.notes ?? null,
    p_lines: patch.lines,
  })
  if (error) throw error
  return fromRow<DeliveryChallan>((data as Row[])[0], maps.deliveryChallans)
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
