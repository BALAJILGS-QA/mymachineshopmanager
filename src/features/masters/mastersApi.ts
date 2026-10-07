// Production masters data-access (Phase 4) — Supabase-direct.
// Work centres / machines / operations / routings are simple master data (CRUD
// via supabaseCrud under tenant RLS). Routing steps are a child collection of a
// routing. See migration 0075.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import type { Machine, Operation, Routing, RoutingStep, WorkCenter } from '@/types'

function crud<T extends { id: string }>(mapKey: keyof typeof maps, idPrefix: string) {
  const map = maps[mapKey]
  return {
    list: async (): Promise<T[]> => selectAll<T>(map),
    create: async (input: Partial<T>): Promise<T> =>
      insertRow<T>(map, { id: uid(idPrefix), ...input } as Record<string, unknown>),
    update: async (id: string, patch: Partial<T>): Promise<T> =>
      updateRow<T>(map, id, patch as Record<string, unknown>),
    remove: async (id: string): Promise<void> => deleteRow(map, id),
  }
}

export const workCentersApi = crud<WorkCenter>('workCenters', 'wc_')
export const machinesApi = crud<Machine>('machines', 'mch_')
export const operationsApi = crud<Operation>('operations', 'op_')
export const routingsApi = crud<Routing>('routings', 'rtg_')

// ---- Routing steps (child of a routing) ------------------------------------
export async function listRoutingSteps(routingId: string): Promise<RoutingStep[]> {
  const { data, error } = await sb()
    .from('routing_steps')
    .select('*')
    .eq('routing_id', routingId)
    .order('seq', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<RoutingStep>(r as Row, maps.routingSteps))
}

export async function createRoutingStep(input: Partial<RoutingStep>): Promise<RoutingStep> {
  return insertRow<RoutingStep>(maps.routingSteps, {
    id: uid('rst_'),
    ...input,
  } as Record<string, unknown>)
}

export async function updateRoutingStep(
  id: string,
  patch: Partial<RoutingStep>,
): Promise<RoutingStep> {
  return updateRow<RoutingStep>(maps.routingSteps, id, patch as Record<string, unknown>)
}

export async function deleteRoutingStep(id: string): Promise<void> {
  return deleteRow(maps.routingSteps, id)
}
