import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/materialsApi'

// ---- Materials master ----
export function useMaterials() {
  return useQuery({ queryKey: qk.materials.all, queryFn: api.listMaterials })
}

export function useCreateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.MaterialCreateInput) => api.createMaterial(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.materials.all }),
  })
}

export function useUpdateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.MaterialUpdateInput }) =>
      api.updateMaterial(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.materials.all }),
  })
}

export function useDeleteMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteMaterial(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.materials.all }),
  })
}

// ---- Stock movements ----
export function useReceipts() {
  return useQuery({ queryKey: qk.stock.receipts, queryFn: api.listReceipts })
}
export function useIssues() {
  return useQuery({ queryKey: qk.stock.issues, queryFn: api.listIssues })
}
export function useAdjustments() {
  return useQuery({ queryKey: qk.stock.adjustments, queryFn: api.listAdjustments })
}

// Any stock movement changes balances everywhere → invalidate the whole 'stock'
// prefix (receipts + issues + adjustments).
function invalidateStock(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.stock.all })
}

export function useCreateReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.ReceiptInput) => api.createReceipt(input),
    onSuccess: () => invalidateStock(qc),
  })
}

export function useCreateIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ input, override }: { input: api.IssueInput; override?: boolean }) =>
      api.createIssue(input, override),
    onSuccess: () => invalidateStock(qc),
  })
}

export function useCreateAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.AdjustmentInput) => api.createAdjustment(input),
    onSuccess: () => invalidateStock(qc),
  })
}

export function useRemoveReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.removeReceipt(id),
    onSuccess: () => invalidateStock(qc),
  })
}

export function useRemoveIssue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.removeIssue(id),
    onSuccess: () => invalidateStock(qc),
  })
}
