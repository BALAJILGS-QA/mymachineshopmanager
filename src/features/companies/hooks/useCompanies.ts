// TanStack Query hooks for companies. The UI talks only to these — it no longer
// reads the store directly for company data. Mutations invalidate the list so
// the table reflects writes; error handling/toasts stay in the components.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/companiesApi'

export function useCompanies() {
  return useQuery({ queryKey: qk.companies.all, queryFn: api.listCompanies })
}

export function useCreateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.CompanyCreateInput) => api.createCompany(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.companies.all }),
  })
}

export function useUpdateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.CompanyUpdateInput }) =>
      api.updateCompany(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.companies.all }),
  })
}

export function useDeleteCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteCompany(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.companies.all }),
  })
}
