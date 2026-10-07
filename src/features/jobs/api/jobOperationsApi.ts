// Per-order operation sequence (Phase 4) — Supabase-direct.
// Ad-hoc steps are simple CRUD under tenant RLS; attaching a routing copies its
// steps atomically via the instantiate_routing RPC (migration 0075).

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import type { JobOperation } from '@/types'

export async function listJobOperations(jobId: string): Promise<JobOperation[]> {
  const { data, error } = await sb()
    .from('job_operations')
    .select('*')
    .eq('job_id', jobId)
    .order('seq', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<JobOperation>(r as Row, maps.jobOperations))
}

// Every operation across the tenant's orders (RLS-scoped). Used by the
// Production Schedule to build a per-work-centre capacity view.
export async function listAllJobOperations(): Promise<JobOperation[]> {
  const { data, error } = await sb()
    .from('job_operations')
    .select('*')
    .order('seq', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<JobOperation>(r as Row, maps.jobOperations))
}

export async function createJobOperation(input: Partial<JobOperation>): Promise<JobOperation> {
  return insertRow<JobOperation>(maps.jobOperations, {
    id: uid('jop_'),
    status: 'Planned',
    ...input,
  } as Record<string, unknown>)
}

export async function updateJobOperation(
  id: string,
  patch: Partial<JobOperation>,
): Promise<JobOperation> {
  return updateRow<JobOperation>(maps.jobOperations, id, patch as Record<string, unknown>)
}

export async function deleteJobOperation(id: string): Promise<void> {
  return deleteRow(maps.jobOperations, id)
}

// Copy a routing's steps onto the order (replaces the current sequence by default).
export async function instantiateRouting(
  jobId: string,
  routingId: string,
  replace = true,
): Promise<JobOperation[]> {
  const { data, error } = await sb().rpc('instantiate_routing', {
    p_job_id: jobId,
    p_routing_id: routingId,
    p_replace: replace,
  })
  if (error) throw error
  return (data as Row[]).map((r) => fromRow<JobOperation>(r, maps.jobOperations))
}

// ---- Per-operation execution (Phase 5) — rule-bearing, go through RPCs ----

export async function startJobOperation(id: string, operator?: string): Promise<JobOperation> {
  const { data, error } = await sb().rpc('job_operation_start', {
    p_id: id,
    p_operator: operator ?? null,
  })
  if (error) throw error
  return fromRow<JobOperation>(data as Row, maps.jobOperations)
}

export async function completeJobOperation(
  id: string,
  opts: { qty?: number; actualMin?: number; note?: string } = {},
): Promise<JobOperation> {
  const { data, error } = await sb().rpc('job_operation_complete', {
    p_id: id,
    p_qty: opts.qty ?? null,
    p_actual_min: opts.actualMin ?? null,
    p_note: opts.note ?? null,
  })
  if (error) throw error
  return fromRow<JobOperation>(data as Row, maps.jobOperations)
}

export async function skipJobOperation(id: string, note?: string): Promise<JobOperation> {
  const { data, error } = await sb().rpc('job_operation_skip', {
    p_id: id,
    p_note: note ?? null,
  })
  if (error) throw error
  return fromRow<JobOperation>(data as Row, maps.jobOperations)
}
