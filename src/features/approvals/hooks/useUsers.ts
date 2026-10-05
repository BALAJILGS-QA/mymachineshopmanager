import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import type { UserRole } from '@/types'
import * as api from '../api/usersApi'

export function useUsers() {
  return useQuery({ queryKey: qk.users.all, queryFn: api.listUsers })
}

// An approval/rejection also changes the tenant's subscription (a 30-day trial is
// provisioned on approval), so refresh the super-admin subscription view too.
function invalidateUserViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.users.all })
  qc.invalidateQueries({ queryKey: ['user-subscriptions'] })
}

export function useApproveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, by, email }: { id: string; by: string; email: string }) =>
      api.approveUser(id, by, email),
    onSuccess: () => invalidateUserViews(qc),
  })
}

export function useRejectUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, by, email }: { id: string; by: string; email: string }) =>
      api.rejectUser(id, by, email),
    onSuccess: () => invalidateUserViews(qc),
  })
}

export function useUpdateUserAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; role?: UserRole; permissions?: string[] }) =>
      api.updateUserAccess(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users.all }),
  })
}
