import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../api/usersApi'

export function useUsers() {
  return useQuery({ queryKey: qk.users.all, queryFn: api.listUsers })
}

export function useApproveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, by, email }: { id: string; by: string; email: string }) =>
      api.approveUser(id, by, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users.all }),
  })
}

export function useRejectUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, by, email }: { id: string; by: string; email: string }) =>
      api.rejectUser(id, by, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users.all }),
  })
}
