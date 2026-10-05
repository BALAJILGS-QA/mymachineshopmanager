import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/subscriptionApi'
import type { PlanId } from '../plans'

const KEY = ['subscription'] as const

export function useSubscription() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.getMySubscription,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSetPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ plan, billing }: { plan: PlanId; billing?: api.BillingCycle }) =>
      api.setTenantPlan(plan, billing),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['user-subscriptions'] })
    },
  })
}

// Super-admin: all users' subscriptions (for the Approvals / Roles screens).
// `enabled` lets callers skip the fetch for non-super-admins.
export function useUserSubscriptions(enabled = true) {
  return useQuery({
    queryKey: ['user-subscriptions'],
    queryFn: api.listUserSubscriptions,
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

// Super-admin: subscription history for one tenant (loaded when the detail drawer
// opens). `enabled` gates the fetch to when a tenant is actually selected.
export function useSubscriptionEvents(tenantId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['subscription-events', tenantId],
    queryFn: () => api.listSubscriptionEvents(tenantId as string),
    enabled: enabled && !!tenantId,
    staleTime: 60 * 1000,
  })
}
