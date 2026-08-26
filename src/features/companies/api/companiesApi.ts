// Companies data-access (service) layer. Async by contract so the hooks/UI above
// never change when this is later re-pointed from the local repo to direct
// Supabase calls (Phase 5b). Today it delegates to companyRepo — the single
// mutation path that owns the business rules (uniqueness, referential guards,
// audit, code generation).

import { companyRepo } from '@/data/repo'
import type { Company } from '@/types'

export type CompanyCreateInput = Parameters<typeof companyRepo.create>[0]
export type CompanyUpdateInput = Parameters<typeof companyRepo.update>[1]

export async function listCompanies(): Promise<Company[]> {
  return companyRepo.list()
}

export async function createCompany(input: CompanyCreateInput): Promise<Company> {
  return companyRepo.create(input)
}

export async function updateCompany(id: string, patch: CompanyUpdateInput): Promise<Company> {
  return companyRepo.update(id, patch)
}

export async function deleteCompany(id: string): Promise<void> {
  companyRepo.remove(id)
}
