// Job orders data-access - Supabase-direct. create + transition run server-side
// RPCs (validations, material auto-issue, production events, all atomic).
// update/delete are direct (delete is FK-guarded by issues/invoice lines).

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type { JobOrder, JobStatus, MaterialOwnerType, ProductionEvent } from '@/types'

export type JobCreateInput = Omit<
  JobOrder,
  'id' | 'jobNo' | 'completedQty' | 'createdAt' | 'updatedAt'
> & {
  completedQty?: number
  materialQty?: number
  materialOwner?: MaterialOwnerType
}
export type JobUpdateInput = Partial<JobOrder>
export type JobTransitionOpts = {
  completedQty?: number
  rejectedQty?: number
  note?: string
  operator?: string
}

export async function listJobs(): Promise<JobOrder[]> {
  return selectAll<JobOrder>(maps.jobs)
}

export async function createJob(input: JobCreateInput): Promise<JobOrder> {
  const consume = Number(input.materialQty) || 0
  const { data, error } = await sb().rpc('create_job', {
    p_id: uid('job_'),
    p_job_no: await nextNumberedDoc('job'),
    p_company_id: input.companyId,
    p_customer_po: input.customerPo ?? null,
    p_part_name: input.partName,
    p_part_number: input.partNumber ?? null,
    p_material_id: input.materialId ?? null,
    p_ordered_qty: input.orderedQty,
    p_completed_qty: input.completedQty ?? 0,
    p_rate: input.rate ?? null,
    p_order_date: input.orderDate,
    p_due_date: input.dueDate ?? null,
    p_priority: input.priority,
    p_status: input.status,
    p_notes: input.notes ?? null,
    p_material_qty: consume,
    p_material_owner: input.materialOwner ?? 'Shop',
    p_issue_id: consume > 0 ? uid('iss_') : null,
    p_issue_no: consume > 0 ? await nextNumberedDoc('issue') : null,
  })
  if (error) throw error
  return fromRow<JobOrder>((data as Row[])[0], maps.jobs)
}

export async function updateJob(id: string, patch: JobUpdateInput): Promise<JobOrder> {
  return updateRow<JobOrder>(maps.jobs, id, patch)
}

export async function deleteJob(id: string): Promise<void> {
  return deleteRow(maps.jobs, id)
}

export async function transitionJob(
  id: string,
  to: JobStatus,
  opts?: JobTransitionOpts,
): Promise<JobOrder> {
  const { data, error } = await sb().rpc('transition_job', {
    p_id: id,
    p_to: to,
    p_event_id: uid('pev_'),
    p_completed_qty: opts?.completedQty ?? null,
    p_rejected_qty: opts?.rejectedQty ?? null,
    p_note: opts?.note ?? null,
    p_operator: opts?.operator ?? null,
  })
  if (error) throw error
  return fromRow<JobOrder>((data as Row[])[0], maps.jobs)
}

export async function listJobEvents(jobId: string): Promise<ProductionEvent[]> {
  const { data, error } = await sb()
    .from('production_events')
    .select('*')
    .eq('job_id', jobId)
    .order('at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<ProductionEvent>(r as Row, maps.productionEvents))
}
