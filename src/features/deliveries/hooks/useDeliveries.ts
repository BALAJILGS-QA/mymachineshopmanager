import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import type { DcStatus } from '@/types'
import * as api from '../api/deliveriesApi'

export function useChallans() {
  return useQuery({ queryKey: qk.deliveries.all, queryFn: api.listChallans })
}

export function useCreateChallan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.DcCreateInput) => api.createChallan(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.deliveries.all })
      qc.invalidateQueries({ queryKey: qk.stock.all }) // dispatch deducted stock
    },
  })
}

// Cancelling reverses the dispatched inventory.
export function useCancelChallan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.cancelChallan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.deliveries.all })
      qc.invalidateQueries({ queryKey: qk.stock.all })
      qc.invalidateQueries({ queryKey: qk.invoices.all })
    },
  })
}

export function useUpdateChallan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.DcUpdateInput }) =>
      api.updateChallan(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.deliveries.all }),
  })
}

// Editing quantities re-syncs the dispatched stock, so refresh balances too.
export function useUpdateChallanQuantities() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: Parameters<typeof api.updateChallanQuantities>[1]
    }) => api.updateChallanQuantities(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.deliveries.all })
      qc.invalidateQueries({ queryKey: qk.stock.all })
    },
  })
}

export function useDeleteChallan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteChallan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.deliveries.all }),
  })
}

// Status changes (invoiced/cancelled) and reopen also affect the linked invoice.
function invalidateDeliveriesAndInvoices(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.deliveries.all })
  qc.invalidateQueries({ queryKey: qk.invoices.all })
}

export function useSetChallanStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, invoiceId }: { id: string; status: DcStatus; invoiceId?: string }) =>
      api.setChallanStatus(id, status, invoiceId),
    onSuccess: () => invalidateDeliveriesAndInvoices(qc),
  })
}

export function useReopenChallan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.reopenChallan(id),
    onSuccess: () => invalidateDeliveriesAndInvoices(qc),
  })
}
