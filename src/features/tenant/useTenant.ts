// TanStack Query hooks for tenant membership + active-tenant switching.
// Additive; safe to import once the multi-tenant UI is wired in.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listMyTenants, setActiveTenant } from './tenantApi'

export const tenantKeys = {
  memberships: ['tenant', 'memberships'] as const,
}

export function useMyTenants() {
  return useQuery({
    queryKey: tenantKeys.memberships,
    queryFn: listMyTenants,
    staleTime: 60_000,
  })
}

export function useSetActiveTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setActiveTenant,
    // Active tenant changed → every cached query is now for the wrong tenant.
    onSuccess: () => qc.invalidateQueries(),
  })
}
