// Estimation data-access — Supabase-direct. create/update/status run through
// the server-side RPCs (0088) for atomicity + permission + audit; reads use the
// tenant-scoped rowMap selects. The pure cost math lives in src/data/computations.ts.

import { uid } from '@/lib/id'
import { maps, fromRow, toRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, deleteRow } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type { Estimation, EstimationOperation, EstimationStatus } from '@/types'

export type EstimationInput = Omit<
  Estimation,
  'id' | 'estimationNo' | 'createdAt' | 'updatedAt' | 'operations'
> & { operations?: EstimationOperation[] }

export async function listEstimations(): Promise<Estimation[]> {
  return selectAll<Estimation>(maps.estimations)
}

export async function getEstimation(id: string): Promise<Estimation | null> {
  const { data, error } = await sb().from('estimations').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? fromRow<Estimation>(data as Row, maps.estimations) : null
}

export async function listEstimationOperations(
  estimationId: string,
): Promise<EstimationOperation[]> {
  const { data, error } = await sb()
    .from('estimation_operations')
    .select('*')
    .eq('estimation_id', estimationId)
    .order('seq')
  if (error) throw error
  return (data as Row[]).map((r) => fromRow<EstimationOperation>(r, maps.estimationOperations))
}

// Build the snake_case header jsonb the RPC expects (toRow maps camel→snake).
function headerJson(input: EstimationInput): Row {
  const row = toRow(input as unknown as Record<string, unknown>, maps.estimations)
  delete row.id
  delete row.estimation_no
  delete row.tenant_id
  delete row.created_at
  delete row.updated_at
  return row
}

function operationsJson(ops: EstimationOperation[] = []): Row[] {
  return ops.map((o, i) => ({
    id: o.id || '',
    seq: o.seq || i + 1,
    operation_name: o.operationName,
    machine_type: o.machineType ?? null,
    setup_time_min: o.setupTimeMin ?? 0,
    cycle_time_min: o.cycleTimeMin ?? 0,
    batch_qty: o.batchQty ?? 1,
    machine_hour_rate: o.machineHourRate ?? 0,
    operator_cost_hour: o.operatorCostHour ?? 0,
    tooling_cost: o.toolingCost ?? 0,
    subcontract_cost_pc: o.subcontractCostPc ?? 0,
    notes: o.notes ?? null,
  }))
}

export async function createEstimation(input: EstimationInput): Promise<Estimation> {
  const id = uid('est_')
  const no = await nextNumberedDoc('estimation')
  const { data, error } = await sb().rpc('create_estimation', {
    p_id: id,
    p_estimation_no: no,
    p_header: headerJson(input),
    p_operations: operationsJson(input.operations),
  })
  if (error) throw error
  return fromRow<Estimation>(data as Row, maps.estimations)
}

export async function updateEstimation(id: string, input: EstimationInput): Promise<Estimation> {
  const { data, error } = await sb().rpc('update_estimation', {
    p_id: id,
    p_header: headerJson(input),
    p_operations: operationsJson(input.operations),
  })
  if (error) throw error
  return fromRow<Estimation>(data as Row, maps.estimations)
}

export async function setEstimationStatus(
  id: string,
  status: EstimationStatus,
): Promise<Estimation> {
  const { data, error } = await sb().rpc('set_estimation_status', { p_id: id, p_status: status })
  if (error) throw error
  return fromRow<Estimation>(data as Row, maps.estimations)
}

export async function deleteEstimation(id: string): Promise<void> {
  // Draft deletion only — enforced in the UI; FK (quotations.estimation_id) is
  // nullable + not cascading, so a converted estimation is protected.
  return deleteRow(maps.estimations, id)
}
