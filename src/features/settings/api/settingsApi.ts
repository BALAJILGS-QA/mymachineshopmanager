// Settings (singleton config) + products (rate list) data-access layer. Async by
// contract; delegates to settingsRepo/productRepo today, re-pointed at Supabase
// in phase 5b. Settings persist inside app_state.

import { settingsRepo, productRepo } from '@/data/repo'
import type { Product, Settings } from '@/types'

export type SettingsPatch = Parameters<typeof settingsRepo.update>[0]
export type ProductCreateInput = Parameters<typeof productRepo.create>[0]
export type ProductUpdateInput = Parameters<typeof productRepo.update>[1]

export async function getSettings(): Promise<Settings> {
  return settingsRepo.get()
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  return settingsRepo.update(patch)
}

export async function listProducts(): Promise<Product[]> {
  return productRepo.list()
}

export async function createProduct(input: ProductCreateInput): Promise<Product> {
  return productRepo.create(input)
}

export async function updateProduct(id: string, patch: ProductUpdateInput): Promise<Product> {
  return productRepo.update(id, patch)
}

export async function deleteProduct(id: string): Promise<void> {
  productRepo.remove(id)
}
