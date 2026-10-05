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

export interface UserSubscription extends Subscription {
  email: string
  tenantId: string | null
  tenantName: string | null
}

// Super-admin only: every registered user's subscription (plan + trial), keyed by
// email. Returns [] for non-super-admins (enforced in the DB).
export async function listUserSubscriptions(): Promise<UserSubscription[]> {
  const { data, error } = await sb().rpc('list_user_subscriptions')
  if (error) throw error
  return (Array.isArray(data) ? data : []) as UserSubscription[]
}
