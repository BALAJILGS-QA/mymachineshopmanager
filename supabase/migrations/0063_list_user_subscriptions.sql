-- 0063_list_user_subscriptions.sql
--
-- Super-admin view of every registered user's subscription, for the Approvals /
-- user-management screen. Returns one row per active tenant membership (preferring
-- the owner membership), joined to the tenant's plan + trial. Super-admin only;
-- returns [] for anyone else. Idempotent.

create or replace function public.list_user_subscriptions()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v jsonb;
begin
  if not public.is_super_admin() then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(x.row), '[]'::jsonb) into v
  from (
    select distinct on (lower(uta.email))
      jsonb_build_object(
        'email',       lower(uta.email),
        'tenantId',    t.id,
        'tenantName',  t.name,
        'plan',        t.plan,
        'status',      t.subscription_status,
        'trialEndsAt', t.trial_ends_at,
        'daysLeft',    case when t.trial_ends_at is null then null
                            else greatest(0, ceil(extract(epoch from (t.trial_ends_at - now())) / 86400.0))::int end
      ) as row
    from public.user_tenant_access uta
    join public.tenants t on t.id = uta.tenant_id
    where uta.status = 'active'
    order by lower(uta.email), (uta.role = 'owner') desc
  ) x;

  return v;
end $$;

grant execute on function public.list_user_subscriptions() to authenticated;
