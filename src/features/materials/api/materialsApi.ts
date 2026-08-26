// Materials master + stock movements - Supabase-direct. Master + receipts are
// simple CRUD (+ server numbering); issue and adjustment run the stock-guard RPCs.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextCode, nextNumberedDoc } from '@/lib/api/numbering'
import type { Material, MaterialIssue, MaterialReceipt, StockAdjustment } from '@/types'

export type MaterialCreateInput = Omit<Material, 'id' | 'code' | 'createdAt' | 'updatedAt'> & {
  code?: string
}
export type MaterialUpdateInput = Partial<Material>
export type ReceiptInput = Omit<MaterialReceipt, 'id' | 'receiptNo' | 'createdAt' | 'updatedAt'>
export type IssueInput = Omit<MaterialIssue, 'id' | 'issueNo' | 'createdAt' | 'updatedAt'>
export type AdjustmentInput = Omit<StockAdjustment, 'id' | 'adjNo' | 'createdAt' | 'updatedAt'>

// ---- Materials master ----
export async function listMaterials(): Promise<Material[]> {
  return selectAll<Material>(maps.materials)
}
export async function createMaterial(input: MaterialCreateInput): Promise<Material> {
  const code = input.code?.trim() || (await nextCode('materialCode', 'M'))
  return insertRow<Material>(maps.materials, {
    ...input,
    id: uid('mat_'),
    code,
    name: input.name.trim(),
    active: input.active ?? true,
  })
}
export async function updateMaterial(id: string, patch: MaterialUpdateInput): Promise<Material> {
  return updateRow<Material>(maps.materials, id, patch)
}
export async function deleteMaterial(id: string): Promise<void> {
  return deleteRow(maps.materials, id)
}

// ---- Stock movements ----
export async function listReceipts(): Promise<MaterialReceipt[]> {
  return selectAll<MaterialReceipt>(maps.receipts)
}
export async function listIssues(): Promise<MaterialIssue[]> {
  return selectAll<MaterialIssue>(maps.issues)
}
export async function listAdjustments(): Promise<StockAdjustment[]> {
  return selectAll<StockAdjustment>(maps.adjustments)
}

export async function createReceipt(input: ReceiptInput): Promise<MaterialReceipt> {
  return insertRow<MaterialReceipt>(maps.receipts, {
    ...input,
    companyId: input.ownerType === 'Shop' ? undefined : input.companyId,
    id: uid('rcp_'),
    receiptNo: await nextNumberedDoc('receipt'),
  })
}

export async function createIssue(input: IssueInput, override = false): Promise<MaterialIssue> {
  const { data, error } = await sb().rpc('create_material_issue', {
    p_id: uid('iss_'),
    p_issue_no: await nextNumberedDoc('issue'),
    p_date: input.date,
    p_material_id: input.materialId,
    p_job_id: input.jobId,
    p_company_id: input.companyId ?? null,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_note: input.note ?? null,
    p_override: override,
  })
  if (error) throw error
  return fromRow<MaterialIssue>((data as Row[])[0], maps.issues)
}

export async function createAdjustment(input: AdjustmentInput): Promise<StockAdjustment> {
  const { data, error } = await sb().rpc('create_stock_adjustment', {
    p_id: uid('adj_'),
    p_adj_no: await nextNumberedDoc('adjustment'),
    p_date: input.date,
    p_material_id: input.materialId,
    p_company_id: input.companyId ?? null,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_reason: input.reason,
  })
  if (error) throw error
  return fromRow<StockAdjustment>((data as Row[])[0], maps.adjustments)
}

export async function removeReceipt(id: string): Promise<void> {
  return deleteRow(maps.receipts, id)
}
export async function removeIssue(id: string): Promise<void> {
  return deleteRow(maps.issues, id)
}
