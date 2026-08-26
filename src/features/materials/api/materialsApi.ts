// Materials master + stock movements data-access (service) layer. Async by
// contract; delegates to materialRepo/stockRepo today, re-pointed at Supabase in
// phase 5b. Stock list reads currently come off the in-memory store (the repo
// exposes no list methods for movements); those become Supabase selects in 5b.

import { materialRepo, stockRepo } from '@/data/repo'
import { getDb } from '@/data/db'
import type { Material, MaterialIssue, MaterialReceipt, StockAdjustment } from '@/types'

export type MaterialCreateInput = Parameters<typeof materialRepo.create>[0]
export type MaterialUpdateInput = Parameters<typeof materialRepo.update>[1]
export type ReceiptInput = Parameters<typeof stockRepo.receipt>[0]
export type IssueInput = Parameters<typeof stockRepo.issue>[0]
export type AdjustmentInput = Parameters<typeof stockRepo.adjust>[0]

// ---- Materials master ----
export async function listMaterials(): Promise<Material[]> {
  return materialRepo.list()
}
export async function createMaterial(input: MaterialCreateInput): Promise<Material> {
  return materialRepo.create(input)
}
export async function updateMaterial(id: string, patch: MaterialUpdateInput): Promise<Material> {
  return materialRepo.update(id, patch)
}
export async function deleteMaterial(id: string): Promise<void> {
  materialRepo.remove(id)
}

// ---- Stock movements ----
export async function listReceipts(): Promise<MaterialReceipt[]> {
  return getDb().receipts
}
export async function listIssues(): Promise<MaterialIssue[]> {
  return getDb().issues
}
export async function listAdjustments(): Promise<StockAdjustment[]> {
  return getDb().adjustments
}
export async function createReceipt(input: ReceiptInput): Promise<MaterialReceipt> {
  return stockRepo.receipt(input)
}
export async function createIssue(input: IssueInput, override = false): Promise<MaterialIssue> {
  return stockRepo.issue(input, override)
}
export async function createAdjustment(input: AdjustmentInput): Promise<StockAdjustment> {
  return stockRepo.adjust(input)
}
export async function removeReceipt(id: string): Promise<void> {
  stockRepo.removeReceipt(id)
}
export async function removeIssue(id: string): Promise<void> {
  stockRepo.removeIssue(id)
}
