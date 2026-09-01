// Vendor (supplier / subcontractor) master — Supabase-direct simple CRUD.
// Codes are minted from the server counter (VEN001, VEN002, …), like companies.

import { uid } from '@/lib/id'
import { maps } from '@/lib/api/rowMap'
import { selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextCode } from '@/lib/api/numbering'
import type { Vendor } from '@/types'

export type VendorCreateInput = Omit<Vendor, 'id' | 'code' | 'createdAt' | 'updatedAt'> & {
  code?: string
}
export type VendorUpdateInput = Partial<Vendor>

export async function listVendors(): Promise<Vendor[]> {
  return selectAll<Vendor>(maps.vendors)
}

export async function createVendor(input: VendorCreateInput): Promise<Vendor> {
  const code = input.code?.trim() || (await nextCode('vendor', 'VEN'))
  return insertRow<Vendor>(maps.vendors, { ...input, id: uid('ven_'), code })
}

export async function updateVendor(id: string, patch: VendorUpdateInput): Promise<Vendor> {
  return updateRow<Vendor>(maps.vendors, id, patch)
}

export async function deleteVendor(id: string): Promise<void> {
  return deleteRow(maps.vendors, id)
}
