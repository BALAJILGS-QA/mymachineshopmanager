// Thin generic Supabase CRUD used by the feature api modules for simple entities
// (no cross-row rules): select-all, insert, patch-update, delete. Rule-bearing
// mutations use the RPCs instead. Row<->entity mapping via rowMap.

import { supabase } from '@/data/supabase'
import { fromRow, type Row, type TableMap } from './rowMap'

export function sb() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export async function selectAll<T>(map: TableMap): Promise<T[]> {
  const { data, error } = await sb().from(map.table).select('*')
  if (error) throw error
  return (data ?? []).map((r) => fromRow<T>(r as Row, map))
}

// Insert a client-built entity. undefined fields are omitted so DB defaults
// (e.g. created_at/updated_at = now()) apply instead of being nulled.
export async function insertRow<T>(map: TableMap, entity: Record<string, unknown>): Promise<T> {
  const row: Row = {}
  for (const [tsField, col] of Object.entries(map.fields)) {
    const v = entity[tsField]
    if (v !== undefined) row[col] = v
  }
  const { data, error } = await sb().from(map.table).insert(row).select().single()
  if (error) throw error
  return fromRow<T>(data as Row, map)
}

// Patch-update: only the fields present in `patch` are written (undefined values
// are written as null to clear a column). Always bumps updated_at.
export async function updateRow<T>(
  map: TableMap,
  id: string,
  patch: Record<string, unknown>,
): Promise<T> {
  const row: Row = {}
  for (const [tsField, col] of Object.entries(map.fields)) {
    if (tsField in patch) row[col] = patch[tsField] === undefined ? null : patch[tsField]
  }
  // Bump updated_at when the table has one (all business tables do).
  if (map.fields['updatedAt']) row[map.fields['updatedAt']] = new Date().toISOString()
  const { data, error } = await sb().from(map.table).update(row).eq('id', id).select().single()
  if (error) throw error
  return fromRow<T>(data as Row, map)
}

export async function deleteRow(map: TableMap, id: string): Promise<void> {
  const { error } = await sb().from(map.table).delete().eq('id', id)
  if (error) throw error
}
