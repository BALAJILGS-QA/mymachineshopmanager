-- 0065_subscription_detail.sql
--
-- Richer subscription metadata + history for the Super-Admin Roles & Permissions
-- "Plan & Status" view. Subscription is COMPANY/TENANT-level (migrations 0062-0064):
-- it lives on `tenants`; users inherit their tenant's subscription via
-- user_tenant_access. This migration ONLY adds columns, a history table, an
-- event-logging trigger, extends set_tenant_plan, and extends/adds read RPCs.
-- It does NOT touch approval / auth / isolation / role logic. Idempotent.

-- 1) Extra columns on tenants (trial_* already exist from 0062).
alter table public.tenants
  add column if not exists subscription_started_at timestamptz,
  add column if not exists upgraded_at             timestamptz,
  add column if not exists upgraded_during_trial   boolean,
  add column if not exists billing_cycle           text,       -- 'monthly' | 'annual'
  add column if not exists next_renewal_at         timestamptz,
  add column if not exists cancelled_at            timestamptz;

-- 2) Subscription history (chronological events). Super-admin read only; writes go
--    through the SECURITY DEFINER trigger below.
create table if not exists public.subscription_events (
  id            text primary key default ('sev_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
  tenant_id     text not null references public.tenants(id) on delete cascade,
  event         text not null,   -- trial_started | plan_upgraded | subscription_activated
                                 -- | subscription_renewed | subscription_cancelled | subscription_expired
  plan          text,
  billing_cycle text,
  at            timestamptz not null default now(),
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists ix_subscription_events_tenant on public.subscription_events (tenant_id, at);
alter table public.subscription_events enable row level security;
drop policy if exists sev_superadmin_read on public.subscription_events;
create policy sev_superadmin_read on public.subscription_events
  for select using (public.is_super_admin());

-- 3) Event-logging trigger — keeps history in sync without modifying the core
--    approval / provisioning / upgrade functions. Runs as definer so it can always
--    write the (RLS-protected) events table regardless of the caller.
create or replace function public.log_subscription_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (tg_op = 'INSERT') then
    if new.trial_ends_at is not null then
      insert into public.subscription_events (tenant_id, event, plan, at, note)
      values (new.id, 'trial_started', coalesce(new.plan, 'trial'),
              coalesce(new.trial_started_at, now()), '30-day free trial');
    end if;
    return new;
  end if;

  -- UPDATE
  if new.subscription_status = 'active' and coalesce(old.subscription_status, '') <> 'active' then
    if coalesce(new.plan, '') <> coalesce(old.plan, '') then
      insert into public.subscription_events (tenant_id, event, plan, billing_cycle, at, note)
      values (new.id, 'plan_upgraded', new.plan, new.billing_cycle, coalesce(new.upgraded_at, now()),
              case when new.upgraded_during_trial then 'Upgraded during trial' else 'Upgraded after trial' end);
    end if;
    insert into public.subscription_events (tenant_id, event, plan, billing_cycle, at)
    values (new.id, 'subscription_activated', new.plan, new.billing_cycle,
            coalesce(new.subscription_started_at, now()));
  end if;

  if new.cancelled_at is not null and old.cancelled_at is null then
    insert into public.subscription_events (tenant_id, event, plan, at)
    values (new.id, 'subscription_cancelled', new.plan, new.cancelled_at);
  end if;

  return new;
end $$;

drop trigger if exists trg_log_subscription_event on public.tenants;
create trigger trg_log_subscription_event
  after insert or update on public.tenants
  for each row execute function public.log_subscription_event();

-- 4) Extend set_tenant_plan to record billing cycle / upgrade / renewal metadata.
--    New optional param keeps the existing frontend call (p_plan only) working.
create or replace function public.set_tenant_plan(p_plan text, p_billing_cycle text default 'monthly')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email       text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_tenant      text;
  v_was_trial   boolean;
begin
  if p_plan not in ('starter', 'professional', 'enterprise') then
    raise exception 'Invalid plan';
  end if;
  if coalesce(p_billing_cycle, 'monthly') not in ('monthly', 'annual') then
    raise exception 'Invalid billing cycle';
  end if;

  select tenant_id into v_tenant
    from public.user_tenant_access
   where lower(email) = v_email and status = 'active' and role in ('owner', 'admin')
   order by (role = 'owner') desc
   limit 1;
  if v_tenant is null then
    raise exception 'No tenant available to upgrade';
  end if;

  select (subscription_status = 'trialing' and trial_ends_at is not null and trial_ends_at > now())
    into v_was_trial
    from public.tenants where id = v_tenant;

  update public.tenants
     set plan                   = p_plan,
         subscription_status    = 'active',
         billing_cycle          = coalesce(p_billing_cycle, 'monthly'),
         subscription_started_at = coalesce(subscription_started_at, now()),
         upgraded_at            = now(),
         upgraded_during_trial  = coalesce(upgraded_during_trial, v_was_trial),
         next_renewal_at        = now() + case when coalesce(p_billing_cycle, 'monthly') = 'annual'
                                               then interval '1 year' else interval '1 month' end,
         cancelled_at           = null,
         updated_at             = now()
   where id = v_tenant;

  return public.get_my_subscription();
end $$;

-- 5) Backfill a trial_started event for existing tenants (the trigger only fires on
--    new writes).
insert into public.subscription_events (tenant_id, event, plan, at, note)
select t.id, 'trial_started', coalesce(t.plan, 'trial'), coalesce(t.trial_started_at, t.created_at, now()),
       '30-day free trial'
  from public.tenants t
 where t.trial_started_at is not null
   and not exists (
     select 1 from public.subscription_events e
      where e.tenant_id = t.id and e.event = 'trial_started'
   );

-- 6) Extend the super-admin subscription list with the full field set + a derived
--    display status + a non-negative daysRemaining. Keeps the existing keys
--    (status / daysLeft / plan) so the Approvals screen is unaffected.
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

  select coalesce(jsonb_agg(x.row order by x.email), '[]'::jsonb) into v
  from (
    select distinct on (lower(uta.email))
      lower(uta.email) as email,
      jsonb_build_object(
        'email',               lower(uta.email),
        'tenantId',            t.id,
        'tenantName',          t.name,
        'plan',                t.plan,
        'status',              t.subscription_status,
        'displayStatus',       public.subscription_display_status(t),
        'trialStartDate',      t.trial_started_at,
        'trialEndDate',        t.trial_ends_at,
        'daysLeft',            public.subscription_days_remaining(t),
        'daysRemaining',       public.subscription_days_remaining(t),
        'subscriptionStartDate', t.subscription_started_at,
        'upgradeDate',         t.upgraded_at,
        'upgradedDuringTrial', coalesce(t.upgraded_during_trial, false),
        'billingCycle',        t.billing_cycle,
        'nextRenewalDate',     t.next_renewal_at,
        'cancelledAt',         t.cancelled_at
      ) as row
    from public.user_tenant_access uta
    join public.tenants t on t.id = uta.tenant_id
    where uta.status = 'active'
    order by lower(uta.email), (uta.role = 'owner') desc
  ) x;

  return v;
end $$;

-- Helper: derived, human-facing status (pure, reused by the list + detail).
create or replace function public.subscription_display_status(t public.tenants)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case
    when t.cancelled_at is not null then 'Cancelled'
    when t.status = 'suspended' then 'Suspended'
    when t.subscription_status = 'active' then
      case when t.next_renewal_at is not null and t.next_renewal_at < now() then 'Expired' else 'Active' end
    when t.subscription_status = 'exempt' then 'Active'
    when t.subscription_status = 'trialing' then
      case when t.trial_ends_at is null then 'Pending'
           when t.trial_ends_at <= now() then 'Trial Expired'
           else 'Trial' end
    else 'Pending'
  end;
$$;

-- Helper: non-negative trial days remaining (null when not on trial).
create or replace function public.subscription_days_remaining(t public.tenants)
returns integer
language sql
stable
set search_path to 'public'
as $$
  select case
    when t.subscription_status = 'trialing' and t.trial_ends_at is not null
      then greatest(0, ceil(extract(epoch from (t.trial_ends_at - now())) / 86400.0))::int
    else null
  end;
$$;

-- 7) Per-tenant subscription history for the detail drawer (super-admin only, one
--    call when the drawer opens — not per row).
create or replace function public.get_subscription_events(p_tenant_id text)
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
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'event', e.event, 'plan', e.plan,
           'billingCycle', e.billing_cycle, 'at', e.at, 'note', e.note
         ) order by e.at), '[]'::jsonb)
    into v
    from public.subscription_events e
   where e.tenant_id = p_tenant_id;
  return v;
end $$;

grant execute on function public.set_tenant_plan(text, text) to authenticated;
grant execute on function public.get_subscription_events(text) to authenticated;
