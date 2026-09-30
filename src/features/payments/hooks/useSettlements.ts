import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/settlementsApi'

export function useAllocations() {
  return useQuery({ queryKey: qk.allocations.all, queryFn: api.listAllocations })
}

export function useDeductions() {
  return useQuery({ queryKey: qk.deductions.all, queryFn: api.listDeductions })
}

// A settlement touches payments, allocations, deductions AND recomputes invoice
// status — invalidate all four so every derived figure re-reads.
function invalidateSettlementCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.payments.all })
  qc.invalidateQueries({ queryKey: qk.allocations.all })
  qc.invalidateQueries({ queryKey: qk.deductions.all })
  qc.invalidateQueries({ queryKey: qk.invoices.all })
}

export function useCreateSettlement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.SettlementCreateInput) => api.createSettlement(input),
    onSuccess: () => invalidateSettlementCaches(qc),
  })
}

export function useAllocateAdvance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      paymentId,
      allocations,
    }: {
      paymentId: string
      allocations: api.SettlementAllocationInput[]
    }) => api.allocateAdvance(paymentId, allocations),
    onSuccess: () => invalidateSettlementCaches(qc),
  })
}

export function useReclassifyDeduction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      paymentId,
      invoiceId,
      splits,
    }: {
      paymentId: string
      invoiceId: string
      splits: api.DeductionSplitInput[]
    }) => api.reclassifyDeduction(paymentId, invoiceId, splits),
    onSuccess: () => invalidateSettlementCaches(qc),
  })
}
