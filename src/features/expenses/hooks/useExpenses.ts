import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/expensesApi'

export function useExpenses() {
  return useQuery({ queryKey: qk.expenses.all, queryFn: api.listExpenses })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: api.ExpenseCreateInput) => api.createExpense(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenses.all }),
  })
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.ExpenseUpdateInput }) =>
      api.updateExpense(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenses.all }),
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.expenses.all }),
  })
}
