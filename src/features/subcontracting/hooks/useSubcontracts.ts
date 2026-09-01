import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/subcontractsApi'

export function useSubcontracts() {
  return useQuery({ queryKey: qk.subcontracts.all, queryFn: api.listOrders })
}

export function useSubcontractDocs(scId: string) {
  return useQuery({
    queryKey: qk.subcontracts.docs(scId),
    queryFn: () => api.listDocs(scId),
    enabled: !!scId,
  })
}

export function useCreateSubcontract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.SubcontractCreateInput) => api.createOrder(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subcontracts.all }),
  })
}

export function useUpdateSubcontract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.SubcontractUpdateInput }) =>
      api.updateOrder(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subcontracts.all }),
  })
}

export function useDeleteSubcontract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subcontracts.all }),
  })
}

// Dispatch + receive move stock, so refresh stock balances too.
export function useDispatchSubcontract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.dispatch>[1] }) =>
      api.dispatch(id, input),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: qk.subcontracts.all })
      qc.invalidateQueries({ queryKey: qk.subcontracts.docs(id) })
      qc.invalidateQueries({ queryKey: qk.stock.all })
    },
  })
}

export function useReceiveSubcontract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.receive>[1] }) =>
      api.receive(id, input),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: qk.subcontracts.all })
      qc.invalidateQueries({ queryKey: qk.subcontracts.docs(id) })
      qc.invalidateQueries({ queryKey: qk.stock.all })
      // A vendor invoice creates a job-work expense.
      qc.invalidateQueries({ queryKey: qk.expenses.all })
    },
  })
}
