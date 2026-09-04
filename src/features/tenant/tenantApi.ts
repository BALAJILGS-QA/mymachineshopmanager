// Tenant (business-entity) data access — Supabase-direct.
// Additive building block for multi-tenant onboarding. Not wired into the app
// shell yet; drop <TenantSwitcher /> into the header when onboarding tenant #2.
// Isolation is enforced in the database (RLS + has_tenant_access); the client
// never sends tenant_id on writes — the DB default stamps it.

import { supabase } from '@/data/supabase'

export type TenantMembership = {
  tenantId: string
  code: string
  name: string
  role: string
}

type MembershipRow = {
  tenant_id: string
  role: string
  tenants: { code: string; name: string } | null
}

// Tenants the signed-in user may access (RLS returns only their memberships).
export async function listMyTenants(): Promise<TenantMembership[]> {
  if (!supabase) return []
  const { data: u } = await supabase.auth.getUser()
  const email = u?.user?.email?.toLowerCase()
  let query = supabase
    .from('user_tenant_access')
    .select('tenant_id, role, status, tenants(code, name)')
    .eq('status', 'active')
  if (email) query = query.ilike('email', email)
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as unknown as MembershipRow[]
  return rows.map((r) => ({
    tenantId: r.tenant_id,
    code: r.tenants?.code ?? '',
    name: r.tenants?.name ?? r.tenant_id,
    role: r.role,
  }))
}

// Switch the active tenant for a MULTI-tenant user. Requires the
// `set-active-tenant` Edge Function to be deployed (it sets app_metadata via the
// service role). Single-membership users never need this.
export async function setActiveTenant(tenantId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.functions.invoke('set-active-tenant', {
    body: { tenant_id: tenantId },
  })
  if (error) throw error
  // Refresh the session so the new app_metadata.active_tenant claim lands in the JWT.
  await supabase.auth.refreshSession()
}
