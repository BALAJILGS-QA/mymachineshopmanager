// Materials master + stock movements - Supabase-direct. Master + receipts are
// simple CRUD (+ server numbering); issue and adjustment run the stock-guard RPCs.

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb, selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextCode, nextNumberedDoc } from '@/lib/api/numbering'
import { SHOP_SCOPE } from '@/data/computations'
import type {
  InventoryLedgerRow,
  Material,
  MaterialIssue,
  MaterialReceipt,
  MaterialReceiptStock,
  OwnMaterialPurchase,
  PaymentMethod,
  StockAdjustment,
} from '@/types'

export type MaterialCreateInput = Omit<Material, 'id' | 'code' | 'createdAt' | 'updatedAt'> & {
  code?: string
}
export type MaterialUpdateInput = Partial<Material>
export type ReceiptInput = Omit<MaterialReceipt, 'id' | 'receiptNo' | 'createdAt' | 'updatedAt'>
export type ReceiptUpdateInput = Partial<ReceiptInput>
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

export async function updateReceipt(
  id: string,
  patch: ReceiptUpdateInput,
): Promise<MaterialReceipt> {
  return updateRow<MaterialReceipt>(maps.receipts, id, patch)
}

export async function removeReceipt(id: string): Promise<void> {
  return deleteRow(maps.receipts, id)
}
export async function removeIssue(id: string): Promise<void> {
  return deleteRow(maps.issues, id)
}

// ---- Own material purchases (stock receipt + expense, atomic) ----
export interface OwnPurchaseInput {
  supplier?: string
  materialId: string
  purchaseDate: string
  quantity: number
  unit: string
  totalCost: number
  totalGst: number
  method: PaymentMethod
  notes?: string
}

export async function listOwnPurchases(): Promise<OwnMaterialPurchase[]> {
  return selectAll<OwnMaterialPurchase>(maps.ownPurchases)
}

export async function createOwnPurchase(input: OwnPurchaseInput): Promise<OwnMaterialPurchase> {
  const { data, error } = await sb().rpc('create_own_material_purchase', {
    p_id: uid('opur_'),
    p_supplier: input.supplier ?? null,
    p_material_id: input.materialId,
    p_purchase_date: input.purchaseDate,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_total_cost: input.totalCost,
    p_total_gst: input.totalGst,
    p_notes: input.notes ?? null,
    p_method: input.method,
    p_receipt_id: uid('rcp_'),
    p_receipt_no: await nextNumberedDoc('receipt'),
    p_expense_id: uid('exp_'),
    p_expense_no: await nextNumberedDoc('expense'),
  })
  if (error) throw error
  return fromRow<OwnMaterialPurchase>((data as Row[])[0], maps.ownPurchases)
}

// ---- Per-source stock (material_receipt_stock view) ----
export interface ReceiptStockFilter {
  scope?: string // undefined = all, SHOP_SCOPE = own/shop, else a company id
  materialId?: string
  availableOnly?: boolean // only sources with available > 0 (dispatch pickers)
}

// One row per received stock with its dispatch split (Received / DC / Invoice /
// Total Dispatched / Available / Status). The single source of truth for the
// per-source stock grid and the delivery-challan / invoice source picker.
export async function listReceiptStock(
  f: ReceiptStockFilter = {},
): Promise<MaterialReceiptStock[]> {
  let q = sb().from('material_receipt_stock').select('*')
  if (f.scope === SHOP_SCOPE) q = q.is('company_id', null)
  else if (f.scope) q = q.eq('company_id', f.scope)
  if (f.materialId) q = q.eq('material_id', f.materialId)
  if (f.availableOnly) q = q.gt('available', 0)
  const { data, error } = await q.order('date', { ascending: true }).limit(1000)
  if (error) throw error
  return (data ?? []).map((r) => fromRow<MaterialReceiptStock>(r as Row, maps.materialReceiptStock))
}

// ---- Inventory ledger (unified transaction history) ----
export interface LedgerFilter {
  materialId?: string
  scope?: string // undefined = all, SHOP_SCOPE = own/shop, else a company id
  from?: string
  to?: string
  txnType?: string
}

export async function listLedger(f: LedgerFilter = {}): Promise<InventoryLedgerRow[]> {
  let q = sb().from('inventory_ledger').select('*')
  if (f.materialId) q = q.eq('material_id', f.materialId)
  if (f.scope === SHOP_SCOPE) q = q.is('company_id', null)
  else if (f.scope) q = q.eq('company_id', f.scope)
  if (f.txnType) q = q.eq('txn_type', f.txnType)
  if (f.from) q = q.gte('date', f.from)
  if (f.to) q = q.lte('date', f.to)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []).map((r) => fromRow<InventoryLedgerRow>(r as Row, maps.inventoryLedger))
}
