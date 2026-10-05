-- 0062_subscription_trial.sql
--
-- Subscription / trial foundation + access-model changes.
--   A) Super admin = ONLY admin@sreebalajiindustries.com (platform operator).
--   B) On approval a user becomes Admin of their own tenant and the tenant starts
--      a 30-day free trial.
--   C) tenants gain plan + trial columns; RPCs expose the caller's subscription and
--      let a tenant owner/admin pick a plan.
-- Idempotent; safe to re-run.

-- ---------------------------------------------------------------- A) super admin
create or replace function public.is_super_admin_email(p_email text)
returns boolean
language sql immutable set search_path to 'public'
as $$
  select lower(coalesce(p_email, '')) = 'admin@sreebalajiindustries.com';
$$;

-- ---------------------------------------------------------- C) plan/trial columns
alter table public.tenants
  add column if not exists plan                 text        not null default 'trial',
  add column if not exists subscription_status  text        not null default 'trialing',
  add column if not exists trial_started_at     timestamptz,
  add column if not exists trial_ends_at        timestamptz;

-- Backfill a 30-day trial for existing tenants that never had one (starts from the
-- tenant's creation date). Super-admin (platform) access is exempt at read time.
update public.tenants
   set trial_started_at = coalesce(trial_started_at, created_at, now()),
       trial_ends_at    = coalesce(trial_ends_at, coalesce(created_at, now()) + interval '30 days')
 where trial_ends_at is null;

-- -------------------------------------------- B1) provisioning stamps a 30-day trial
create or replace function public.provision_isolated_tenant_for(p_email text)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_email    text := lower(btrim(p_email));
  v_company  text;
  v_tenant   text;
  v_code     text;
  v_name     text;
  v_existing text;
begin
  if v_email = '' then
    raise exception 'Email is required to provision a tenant';
  end if;

  select tenant_id into v_existing
    from public.user_tenant_access
   where lower(email) = v_email and status in ('active','pending')
   order by (role = 'owner') desc
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  select btrim(coalesce(u ->> 'companyName',''))
    into v_company
    from public.app_state s
    cross join lateral jsonb_array_elements(coalesce(s.data->'users','[]'::jsonb)) u
   where s.id = 'singleton' and lower(u ->> 'email') = v_email
   limit 1;

  v_tenant := 'tnt_' || substr(md5(v_email), 1, 16);
  v_name   := coalesce(nullif(v_company, ''), split_part(v_email, '@', 1));
  v_code   := upper(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g'));
  v_code   := left(coalesce(nullif(v_code, ''), 'TNT'), 8) || '-' || substr(md5(v_email), 1, 4);

  insert into public.tenants (id, code, name, legal_name, plan, subscription_status, trial_started_at, trial_ends_at)
  values (v_tenant, v_code, v_name, v_name, 'trial', 'trialing', now(), now() + interval '30 days')
  on conflict (id) do nothing;

  insert into public.tenant_settings (tenant_id, data)
  values (v_tenant, '{}'::jsonb)
  on conflict (tenant_id) do nothing;

  insert into public.hr_settings (id, data, tenant_id)
  values ('hrset_' || v_tenant, '{}'::jsonb, v_tenant)
  on conflict (id) do nothing;

  insert into public.user_tenant_access (id, email, tenant_id, role, status, created_by)
  values ('uta_' || md5(v_email || ':' || v_tenant), v_email, v_tenant, 'owner', 'active',
          coalesce(auth.jwt() ->> 'email', 'system'))
  on conflict (lower(email), tenant_id) do update set status = 'active', role = 'owner';

  return v_tenant;
end $$;

-- -------------------- B2) approval grants Admin + ensures the tenant trial is set
create or replace function public.set_user_approval(p_email text, p_approved boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_email   text := lower(btrim(p_email));
  v_has_mem boolean;
  v_tenant  text;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may change approvals';
  end if;
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  if p_approved then
    -- Approved users are Admins of their own tenant.
    insert into public.approved_users (email, role, approved_by)
    values (v_email, 'Admin', coalesce(auth.jwt() ->> 'email', 'admin'))
    on conflict (email) do update
      set approved_at = now(), approved_by = excluded.approved_by, role = 'Admin';

    select exists (
      select 1 from public.user_tenant_access
       where lower(email) = v_email and status in ('active','pending')
    ) into v_has_mem;

    if v_has_mem then
      update public.user_tenant_access
         set status = 'active'
       where lower(email) = v_email and status in ('active','pending');
      select tenant_id into v_tenant from public.user_tenant_access
        where lower(email) = v_email and status = 'active'
        order by (role = 'owner') desc limit 1;
    else
      v_tenant := public.provision_isolated_tenant_for(v_email);
    end if;

    -- Start a 30-day trial if the tenant doesn't already have one.
    if v_tenant is not null then
      update public.tenants
         set trial_started_at = coalesce(trial_started_at, now()),
             trial_ends_at    = coalesce(trial_ends_at, now() + interval '30 days'),
             plan             = case when plan is null or plan = '' then 'trial' else plan end,
             subscription_status = case when subscription_status = 'active' then 'active' else 'trialing' end
       where id = v_tenant;
    end if;
  else
    delete from public.approved_users where lower(email) = v_email;
    update public.user_tenant_access set status = 'suspended' where lower(email) = v_email;
  end if;

  -- Mirror the decision into the app_state users registry (status/role + audit).
  update public.app_state
     set data = jsonb_set(
           coalesce(data, '{}'::jsonb),
           '{users}',
           (
             select coalesce(jsonb_agg(
               case when lower(elem ->> 'email') = v_email then
                 elem || jsonb_build_object(
                   'status',    case when p_approved then 'approved' else 'rejected' end,
                   'role',      case when p_approved then 'Admin' else coalesce(elem ->> 'role','User') end,
                   'decidedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                   'decidedBy', coalesce(auth.jwt() ->> 'email', 'admin')
                 )
               else elem end
             ), '[]'::jsonb)
             from jsonb_array_elements(coalesce(data -> 'users', '[]'::jsonb)) elem
           )
         ),
         updated_at = now()
   where id = 'singleton';
end $$;

-- ------------------------------------------------ C) subscription read + plan pick
create or replace function public.get_my_subscription()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_tenant text;
  v_plan   text;
  v_status text;
  v_ends   timestamptz;
begin
  if public.is_super_admin() then
    return jsonb_build_object('plan','platform','status','exempt','trialEndsAt',null,'daysLeft',null);
  end if;

  select tenant_id into v_tenant
    from public.user_tenant_access
   where lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) and status = 'active'
   order by (role = 'owner') desc
   limit 1;

  if v_tenant is null then
    return jsonb_build_object('plan',null,'status','none','trialEndsAt',null,'daysLeft',null);
  end if;

  select plan, subscription_status, trial_ends_at
    into v_plan, v_status, v_ends
    from public.tenants where id = v_tenant;

  return jsonb_build_object(
    'plan', v_plan,
    'status', v_status,
    'trialEndsAt', v_ends,
    'daysLeft', case when v_ends is null then null
                     else greatest(0, ceil(extract(epoch from (v_ends - now())) / 86400.0))::int end
  );
end $$;

create or replace function public.set_tenant_plan(p_plan text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_email  text := lower(coalesce(auth.jwt() ->> 'email',''));
  v_tenant text;
begin
  if p_plan not in ('starter','professional','enterprise') then
    raise exception 'Invalid plan';
  end if;

  select tenant_id into v_tenant
    from public.user_tenant_access
   where lower(email) = v_email and status = 'active' and role in ('owner','admin')
   order by (role = 'owner') desc
   limit 1;

  if v_tenant is null then
    raise exception 'No tenant available to upgrade';
  end if;

  update public.tenants
     set plan = p_plan, subscription_status = 'active', updated_at = now()
   where id = v_tenant;

  return public.get_my_subscription();
end $$;

grant execute on function public.get_my_subscription() to authenticated;
grant execute on function public.set_tenant_plan(text) to authenticated;
