-- 0064_enforce_trial_expiry.sql
--
-- STRICT trial enforcement. Once a tenant's 30-day free trial ends and it has not
-- moved to an active paid plan, the tenant is excluded from current_tenant_ids(),
-- so has_tenant_access()/current_tenant_id() deny it — every table's RLS then
-- returns zero rows and all writes fail. This is the hard server-side gate that a
-- client cannot bypass.
--
-- Super admins still see all tenants (platform operator). get_my_subscription() and
-- set_tenant_plan() resolve the tenant directly from user_tenant_access (not via
-- current_tenant_ids), so an expired tenant can still read its status and upgrade —
-- and upgrading (subscription_status='active') immediately restores access.
-- Idempotent.

create or replace function public.current_tenant_ids()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.tenants where public.is_super_admin()
  union
  select uta.tenant_id
    from public.user_tenant_access uta
    join public.tenants t on t.id = uta.tenant_id
   where lower(uta.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and uta.status = 'active'
     and (
       t.subscription_status = 'active'
       or (
         coalesce(t.subscription_status, 'trialing') = 'trialing'
         and (t.trial_ends_at is null or t.trial_ends_at > now())
       )
     );
$$;
