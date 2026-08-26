import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import { sb } from '@/lib/api/supabaseCrud'
import { SHOP_SCOPE } from '@/data/computations'
import * as api from '../api/materialsApi'

// Balance of a material in an owner scope via the material_balance RPC.
// scope: undefined/SHOP_SCOPE -> shop stock (company_id null); else a company id.
export function useMaterialBalance(materialId: string, scope?: string) {
  const companyId = !scope || scope === SHOP_SCOPE ? null : scope
  return useQuery({
    queryKey: ['materialBalance', materialId, companyId ?? 'shop'],
    queryFn: async () => {
      const { data, error } = await sb().rpc('material_balance', {
        p_material_id: materialId,
        p_company_id: companyId,
      })
      if (error) throw error
      return Number(data)
    },
    enabled: !!materialId,
  })
}

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
