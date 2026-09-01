import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/vendorsApi'

export function useVendors() {
  return useQuery({ queryKey: qk.vendors.all, queryFn: api.listVendors })
}

export function useCreateVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.VendorCreateInput) => api.createVendor(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.vendors.all }),
  })
}

export function useUpdateVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.VendorUpdateInput }) =>
      api.updateVendor(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.vendors.all }),
  })
}

export function useDeleteVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteVendor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.vendors.all }),
  })
}
