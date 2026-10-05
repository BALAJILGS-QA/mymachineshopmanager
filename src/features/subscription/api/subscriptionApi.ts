// Subscription data access (Supabase RPCs). The tenant's plan + trial live on the
// tenants row and are resolved server-side; a super admin is reported as exempt.

import { sb } from '@/lib/api/supabaseCrud'
import type { PlanId } from '../plans'

export interface Subscription {
  plan: string | null
  status: string // 'trialing' | 'active' | 'exempt' | 'none'
  trialEndsAt: string | null
  daysLeft: number | null
}

const FALLBACK: Subscription = { plan: null, status: 'none', trialEndsAt: null, daysLeft: null }

export async function getMySubscription(): Promise<Subscription> {
  const { data, error } = await sb().rpc('get_my_subscription')
  if (error) throw error
  return (data ?? FALLBACK) as Subscription
}

export async function setTenantPlan(plan: PlanId): Promise<Subscription> {
  const { data, error } = await sb().rpc('set_tenant_plan', { p_plan: plan })
  if (error) throw error
  return (data ?? FALLBACK) as Subscription
}

// Full per-user (tenant) subscription record exposed to the super admin. `status`
// is the raw subscription_status; `displayStatus` is the derived, human-facing one.
export interface UserSubscription {
  email: string
  tenantId: string | null
  tenantName: string | null
  plan: string | null
  status: string
  displayStatus: string
  trialStartDate: string | null
  trialEndDate: string | null
  daysLeft: number | null
  daysRemaining: number | null
  subscriptionStartDate: string | null
  upgradeDate: string | null
  upgradedDuringTrial: boolean
  billingCycle: string | null
  nextRenewalDate: string | null
  cancelledAt: string | null
}

// Super-admin only: every registered user's subscription (plan + trial), keyed by
// email. Returns [] for non-super-admins (enforced in the DB).
export async function listUserSubscriptions(): Promise<UserSubscription[]> {
  const { data, error } = await sb().rpc('list_user_subscriptions')
  if (error) throw error
  return (Array.isArray(data) ? data : []) as UserSubscription[]
}

export interface SubscriptionEvent {
  id: string
  event: string
  plan: string | null
  billingCycle: string | null
  at: string
  note: string | null
}

// Super-admin only: chronological subscription history for one tenant (fetched
// on demand when the detail drawer opens — not per table row).
export async function listSubscriptionEvents(tenantId: string): Promise<SubscriptionEvent[]> {
  const { data, error } = await sb().rpc('get_subscription_events', { p_tenant_id: tenantId })
  if (error) throw error
  return (Array.isArray(data) ? data : []) as SubscriptionEvent[]
}
