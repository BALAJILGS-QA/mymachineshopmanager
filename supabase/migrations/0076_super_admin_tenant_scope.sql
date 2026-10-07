-- ============================================================================
-- 0076 — Super-admin cross-tenant READ leak (CRITICAL security fix).
-- ============================================================================
-- SYMPTOM (found 2026-10-07): the Sree Balaji Industries super admin
-- (admin@sreebalajiindustries.com) opened Production Orders and saw the
-- *MSM TEST Phase2* tenant's orders (PROD-2026-000001/000002, "MSM TEST - Aqua
-- Flow"). SBI has no production orders of its own, so the whole list was another
-- tenant's data. The same leak applied to EVERY tenant-isolated table and to the
-- security_invoker reporting views.
--
-- ROOT CAUSE: every tenant table's RLS is `USING (has_tenant_access(tenant_id))`,
-- and BOTH tenant-gate functions returned *all* tenants for a super admin:
--   • has_tenant_access()  (0042): is_super_admin() OR member
--   • current_tenant_ids() (0064): SELECT id FROM tenants WHERE is_super_admin() ...
-- So a super admin read every tenant's rows pooled together — a cross-tenant leak.
-- (The WRITE path, current_tenant_id() in 0042, already scoped to the
-- app_metadata.active_tenant claim; only the READ gates were unscoped.)
--
-- FIX — scope super-admin access to ONE tenant at a time, the active_tenant claim:
--   • A super admin with app_metadata.active_tenant = X may read/write ONLY tenant
--     X. X may be ANY tenant (platform-operator "god mode" is preserved, but it is
--     now explicit and single-tenant — never all tenants pooled). Switching tenant
--     = changing the claim (the existing set-active-tenant Edge Function / session
--     refresh), consistent with current_tenant_id().
--   • A super admin with NO active_tenant claim falls back to their OWN active
--     memberships (same as a normal user) — admin@sreebalajiindustries.com is an
--     SBI member, so they see SBI, never other tenants.
--   • Non-super-admin users: unchanged, trial-gated memberships (0064 logic kept).
--
-- current_tenant_ids() becomes the single source of truth; has_tenant_access() is
-- redefined in terms of it so the read gate, the write gate (current_tenant_id),
-- and trial expiry can never drift apart again.
--
-- Super-admin consoles (list_app_users, list_user_subscriptions,
-- get_my_subscription, set_tenant_plan, get_subscription_events) are SECURITY
-- DEFINER and resolve the tenant directly from user_tenant_access — they bypass
-- RLS and are therefore UNAFFECTED by this scoping.
--
-- Idempotent (CREATE OR REPLACE). Additive & backward-compatible for normal users.
-- See docs/MULTI_TENANT_DESIGN.md §3 and supabase/tests/tenant_isolation_test.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. current_tenant_ids() — the accessible-tenant set, now scoped for super
--    admins. Preserves the 0064 trial gate for ordinary users.
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_ids()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  with claim as (
    select nullif(auth.jwt() -> 'app_metadata' ->> 'active_tenant', '') as active
  )
  -- Super admin WITH an active_tenant claim: exactly that tenant (any tenant).
  select t.id
    from public.tenants t
    cross join claim c
   where public.is_super_admin()
     and c.active is not null
     and t.id = c.active

  union

  -- Super admin WITHOUT an active_tenant claim: their own active memberships only
  -- (NOT all tenants — that was the leak). No trial gate: platform operator.
  select uta.tenant_id
    from public.user_tenant_access uta
    cross join claim c
   where public.is_super_admin()
     and c.active is null
     and lower(uta.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and uta.status = 'active'

  union

  -- Ordinary users: trial-gated active memberships (unchanged from 0064).
  select uta.tenant_id
    from public.user_tenant_access uta
    join public.tenants t on t.id = uta.tenant_id
   where not public.is_super_admin()
     and lower(uta.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and uta.status = 'active'
     and (
       t.subscription_status = 'active'
       or (
         coalesce(t.subscription_status, 'trialing') = 'trialing'
         and (t.trial_ends_at is null or t.trial_ends_at > now())
       )
     );
$$;

-- ---------------------------------------------------------------------------
-- 2. has_tenant_access() — the per-row RLS guard. Defined in terms of
--    current_tenant_ids() so read-gate, write-gate and trial expiry stay in sync
--    and a super admin can never again read outside their active tenant.
-- ---------------------------------------------------------------------------
create or replace function public.has_tenant_access(p_tenant_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.current_tenant_ids() t where t = p_tenant_id
  );
$$;

grant execute on function public.current_tenant_ids() to authenticated;
grant execute on function public.has_tenant_access(text) to authenticated;

-- current_tenant_id() (0042) is unchanged: it honors active_tenant first and
-- otherwise falls back to the single accessible tenant — which now resolves
-- correctly off the scoped current_tenant_ids() above.
