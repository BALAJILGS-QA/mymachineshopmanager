import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/paymentsApi'

export function usePayments() {
  return useQuery({ queryKey: qk.payments.all, queryFn: api.listPayments })
}

// A payment changes the linked invoice's paid/outstanding + status, so both
// caches are invalidated.
function invalidatePaymentsAndInvoices(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.payments.all })
  qc.invalidateQueries({ queryKey: qk.invoices.all })
}

export function useCreatePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.PaymentCreateInput) => api.createPayment(input),
    onSuccess: () => invalidatePaymentsAndInvoices(qc),
  })
}

export function useDeletePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deletePayment(id),
    onSuccess: () => invalidatePaymentsAndInvoices(qc),
  })
}
