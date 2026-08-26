// Settings (app_state singleton JSON) + products (rate list) - Supabase-direct.
// Settings persist under app_state.data.settings; products are a normal table.

import { uid } from '@/lib/id'
import { maps } from '@/lib/api/rowMap'
import { sb, selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextCode, setNumberingCache } from '@/lib/api/numbering'
import { DEFAULT_SETTINGS } from '@/data/seed'
import type { Product, Settings } from '@/types'

export type SettingsPatch = Partial<Settings>
export type ProductCreateInput = Omit<Product, 'id' | 'code' | 'createdAt' | 'updatedAt'> & {
  code?: string
}
export type ProductUpdateInput = Partial<Product>

function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    numbering: { ...DEFAULT_SETTINGS.numbering, ...(stored?.numbering ?? {}) },
    company: { ...DEFAULT_SETTINGS.company, ...(stored?.company ?? {}) },
  }
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await sb()
    .from('app_state')
    .select('data')
    .eq('id', 'singleton')
    .maybeSingle()
  if (error) throw error
  const merged = mergeSettings((data?.data as { settings?: Settings } | null)?.settings)
  setNumberingCache(merged.numbering)
  return merged
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const { data } = await sb().from('app_state').select('data').eq('id', 'singleton').maybeSingle()
  const cur = (data?.data as Record<string, unknown> | null) ?? {}
  const curSettings = mergeSettings(cur.settings as Settings | undefined)
  const next: Settings = {
    ...curSettings,
    ...patch,
    numbering: { ...curSettings.numbering, ...(patch.numbering ?? {}) },
    company: { ...curSettings.company, ...(patch.company ?? {}) },
  }
  const { error } = await sb()
    .from('app_state')
    .upsert({ id: 'singleton', data: { ...cur, settings: next } })
  if (error) throw error
  setNumberingCache(next.numbering)
  return next
}

export async function listProducts(): Promise<Product[]> {
  return selectAll<Product>(maps.products)
}
export async function createProduct(input: ProductCreateInput): Promise<Product> {
  const code = input.code?.trim() || (await nextCode('productCode', 'P'))
  return insertRow<Product>(maps.products, {
    ...input,
    id: uid('prd_'),
    code,
    name: input.name.trim(),
    active: input.active ?? true,
  })
}
export async function updateProduct(id: string, patch: ProductUpdateInput): Promise<Product> {
  return updateRow<Product>(maps.products, id, patch)
}
export async function deleteProduct(id: string): Promise<void> {
  return deleteRow(maps.products, id)
}
