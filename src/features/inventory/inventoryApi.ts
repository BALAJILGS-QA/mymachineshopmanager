// Inventory module data access. Stock Transfers are a NEW additive entity; the
// rest of the Inventory module reuses the existing materials API/hooks, so there
// is no duplicate stock logic here.

import { isSupabaseEnabled, supabase } from '@/data/supabase'
import { maps } from '@/lib/api/rowMap'
import { selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextDocNo } from '@/lib/api/numbering'
import { uid } from '@/lib/id'
import type { StockTransfer } from './types'

function enabled(): boolean {
  return isSupabaseEnabled() && !!supabase
}

export async function listTransfers(): Promise<StockTransfer[]> {
  return enabled() ? selectAll<StockTransfer>(maps.stockTransfers) : []
}

export async function createTransfer(input: Partial<StockTransfer>): Promise<StockTransfer> {
  const transferNo =
    input.transferNo ||
    (enabled() ? await nextDocNo('stock_transfer', 'ST-{FY}-{####}') : undefined)
  return insertRow<StockTransfer>(maps.stockTransfers, {
    id: uid('sxfr_'),
    status: 'draft',
    ...input,
    transferNo,
  } as Record<string, unknown>)
}

export async function updateTransfer(
  id: string,
  patch: Partial<StockTransfer>,
): Promise<StockTransfer> {
  return updateRow<StockTransfer>(maps.stockTransfers, id, patch as Record<string, unknown>)
}

export async function removeTransfer(id: string): Promise<void> {
  return deleteRow(maps.stockTransfers, id)
}
