import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import type { InvoiceStatus } from '@/types'
import * as api from '../api/invoicesApi'

export function useInvoices() {
  return useQuery({ queryKey: qk.invoices.all, queryFn: api.listInvoices })
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.InvoiceCreateInput) => api.createInvoice(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invoices.all }),
  })
}

export function useUpdateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.InvoiceUpdateInput }) =>
      api.updateInvoice(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invoices.all }),
  })
}

export function useSetInvoiceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      api.setInvoiceStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.invoices.all })
      // Cancelling frees linked delivery challans.
      qc.invalidateQueries({ queryKey: qk.deliveries.all })
    },
  })
}
