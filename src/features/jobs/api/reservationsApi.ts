// Material reservation data-access (Phase 3) — Supabase-direct.
// Reservations are a soft hold on a material's FREE stock per production order.
// All rule-bearing writes go through the material_reserve_move RPC (atomic,
// permission-checked, availability-gated); reads use the job_material_status RPC
// and a direct select on the ledger. Owner scope is resolved server-side from the
// material master, so the client never passes it.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type { JobMaterialStatus, JobOrder, MaterialReservation } from '@/types'

// Per-order availability picture (required / reserved / consumed / free / balance).
export async function getJobMaterialStatus(jobId: string): Promise<JobMaterialStatus | null> {
  const { data, error } = await sb().rpc('job_material_status', { p_job_id: jobId })
  if (error) throw error
  const row = (data as Row[] | null)?.[0]
  if (!row) return null
  return {
    materialId: row.material_id as string,
    ownerScope: (row.owner_scope as string | null) ?? null,
    unit: (row.unit as string | null) ?? undefined,
    required: Number(row.required) || 0,
    reserved: Number(row.reserved) || 0,
    consumed: Number(row.consumed) || 0,
    free: Number(row.free) || 0,
    balance: Number(row.balance) || 0,
  }
}

// Reservation ledger for one order (newest first).
export async function listReservationsForJob(jobId: string): Promise<MaterialReservation[]> {
  const { data, error } = await sb()
    .from('material_reservations')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<MaterialReservation>(r as Row, maps.materialReservations))
}

// All reservations (used for cross-order free-stock derivation if needed).
export async function listReservations(): Promise<MaterialReservation[]> {
  return selectAll<MaterialReservation>(maps.materialReservations)
}

// Set / update the per-order material requirement + chosen stock pool.
// ownerScope: null/undefined = own/shop stock; a company id = that customer's stock.
export async function setMaterialRequirement(
  jobId: string,
  requiredQty: number,
  ownerScope?: string | null,
): Promise<JobOrder> {
  const { data, error } = await sb().rpc('set_material_requirement', {
    p_job_id: jobId,
    p_required_qty: requiredQty,
    p_owner_scope: ownerScope ?? null,
  })
  if (error) throw error
  return fromRow<JobOrder>((data as Row[])[0], maps.jobs)
}

type MoveKind = 'Reserve' | 'Release' | 'Consume'

async function move(
  jobId: string,
  kind: MoveKind,
  quantity: number,
  opts: { override?: boolean; note?: string } = {},
): Promise<MaterialReservation> {
  // Consume also mints the physical issue id/no the RPC records in the stock ledger.
  const issueId = kind === 'Consume' ? uid('iss_') : null
  const issueNo = kind === 'Consume' ? await nextNumberedDoc('issue') : null
  const { data, error } = await sb().rpc('material_reserve_move', {
    p_id: uid('mres_'),
    p_job_id: jobId,
    p_kind: kind,
    p_qty: quantity,
    p_override: opts.override ?? false,
    p_issue_id: issueId,
    p_issue_no: issueNo,
    p_note: opts.note ?? null,
  })
  if (error) throw error
  return fromRow<MaterialReservation>((data as Row[])[0], maps.materialReservations)
}

export function reserveMaterial(jobId: string, quantity: number, override?: boolean) {
  return move(jobId, 'Reserve', quantity, { override })
}
export function releaseMaterial(jobId: string, quantity: number, note?: string) {
  return move(jobId, 'Release', quantity, { note })
}
export function consumeMaterial(jobId: string, quantity: number, note?: string) {
  return move(jobId, 'Consume', quantity, { note })
}
