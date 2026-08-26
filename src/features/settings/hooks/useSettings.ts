import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/settingsApi'

export function useSettings() {
  return useQuery({ queryKey: qk.settings.all, queryFn: api.getSettings })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: api.SettingsPatch) => api.updateSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings.all }),
  })
}

export function useProducts() {
  return useQuery({ queryKey: qk.products.all, queryFn: api.listProducts })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.ProductCreateInput) => api.createProduct(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products.all }),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products.all }),
  })
}
