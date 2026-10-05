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
    mutationFn: (plan: PlanId) => api.setTenantPlan(plan),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

// Super-admin: all users' subscriptions (for the Approvals screen). `enabled` lets
// callers skip the fetch for non-super-admins.
export function useUserSubscriptions(enabled = true) {
  return useQuery({
    queryKey: ['user-subscriptions'],
    queryFn: api.listUserSubscriptions,
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}
