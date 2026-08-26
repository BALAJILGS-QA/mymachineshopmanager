// Companies data-access - Supabase-direct. Simple CRUD (no cross-row rules):
// uniqueness/FK are enforced by the schema; the company code is minted from the
// server counter (race-safe) when the user doesn't supply one.

import { uid } from '@/lib/id'
import { maps } from '@/lib/api/rowMap'
import { selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextCode } from '@/lib/api/numbering'
import type { Company } from '@/types'

export type CompanyCreateInput = Omit<Company, 'id' | 'code' | 'createdAt' | 'updatedAt'> & {
  code?: string
}
export type CompanyUpdateInput = Partial<Company>

export async function listCompanies(): Promise<Company[]> {
  return selectAll<Company>(maps.companies)
}

export async function createCompany(input: CompanyCreateInput): Promise<Company> {
  const code = input.code?.trim() || (await nextCode('companyCode', 'C'))
  return insertRow<Company>(maps.companies, {
    ...input,
    id: uid('cmp_'),
    code,
    name: input.name.trim(),
    active: input.active ?? true,
  })
}

export async function updateCompany(id: string, patch: CompanyUpdateInput): Promise<Company> {
  return updateRow<Company>(maps.companies, id, patch)
}

export async function deleteCompany(id: string): Promise<void> {
  return deleteRow(maps.companies, id)
}
