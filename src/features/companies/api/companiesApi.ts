// Companies data-access (service) layer. Async by contract so the hooks/UI above
// never change when this is later re-pointed from the local repo to direct
// Supabase calls (Phase 5b). Today it delegates to companyRepo — the single
// mutation path that owns the business rules (uniqueness, referential guards,
// audit, code generation).

import { companyRepo } from '@/data/repo'
import { supabase } from '@/data/supabase'
import { nextCode } from '@/lib/api/numbering'
import type { Company } from '@/types'

export type CompanyCreateInput = Parameters<typeof companyRepo.create>[0]
export type CompanyUpdateInput = Parameters<typeof companyRepo.update>[1]

export async function listCompanies(): Promise<Company[]> {
  return companyRepo.list()
}

export async function createCompany(input: CompanyCreateInput): Promise<Company> {
  const provided = input.code?.trim()
  // Server-authoritative code when the user didn't supply one — race-safe across
  // clients (replaces the old client-side app_state counter). The repo still
  // enforces uniqueness and persists the row. Offline (no Supabase) falls back to
  // the repo's local sequence so dev/demo still works.
  if (!provided && supabase) {
    return companyRepo.create({ ...input, code: await nextCode('companyCode', 'C') })
  }
  return companyRepo.create(provided ? { ...input, code: provided } : input)
}

export async function updateCompany(id: string, patch: CompanyUpdateInput): Promise<Company> {
  return companyRepo.update(id, patch)
}

export async function deleteCompany(id: string): Promise<void> {
  companyRepo.remove(id)
}
