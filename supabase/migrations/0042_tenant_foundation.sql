-- ============================================================================
-- Multi-tenant foundation: tenants, user_tenant_access, access functions.
-- ============================================================================
-- PURELY ADDITIVE. Creates the new isolation axis (tenants + memberships) and
-- the access-decision functions. Does NOT alter any existing business table or
-- policy yet — those change in 0043 (add tenant_id) and 0044 (enforce). The app
-- keeps working exactly as today after this migration.
--
-- See docs/MULTI_TENANT_DESIGN.md §2–§3.
-- Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. tenants (business entities)
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id          text primary key,
  code        text not null unique,
  name        text not null,
  legal_name  text,
  gstin       text,
  status      text not null default 'active' check (status in ('active','suspended','closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Seed the first tenant = the current live business.
insert into public.tenants (id, code, name, legal_name)
values ('tnt_sreebalaji','SBI','Sree Balaji Industries','Sree Balaji Industries')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. user_tenant_access (which users may access which tenants, and their role)
-- ---------------------------------------------------------------------------
create table if not exists public.user_tenant_access (
  id          text primary key,
  email       text not null,
  tenant_id   text not null references public.tenants(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member','viewer')),
  status      text not null default 'active' check (status in ('active','pending','suspended')),
  created_at  timestamptz not null default now(),
  created_by  text
);
create unique index if not exists uq_uta_email_tenant on public.user_tenant_access (lower(email), tenant_id);
create index if not exists idx_uta_email on public.user_tenant_access (lower(email));

-- Backfill: every currently-approved user becomes an active member of tenant SBI.
insert into public.user_tenant_access (id, email, tenant_id, role, status, created_by)
select 'uta_' || md5(lower(a.email)), lower(a.email), 'tnt_sreebalaji',
       case when coalesce(a.role,'') ilike '%admin%' then 'admin' else 'member' end,
       'active', 'backfill_0041'
from public.approved_users a
on conflict (lower(email), tenant_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Access-decision functions (SECURITY DEFINER, search_path pinned)
-- ---------------------------------------------------------------------------

-- Tenants the caller may access (super admin ⇒ all).
create or replace function public.current_tenant_ids()
returns setof text language sql stable security definer set search_path = public as $$
  select id from public.tenants where public.is_super_admin()
  union
  select tenant_id from public.user_tenant_access
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) and status = 'active';
$$;

-- Row-level guard used by every tenant-isolation RLS policy (0044+).
create or replace function public.has_tenant_access(p_tenant_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.user_tenant_access
                 where tenant_id = p_tenant_id
                   and lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
                   and status = 'active');
$$;

-- The tenant to STAMP on new rows, chosen server-side. Honors an optional
-- app_metadata.active_tenant claim (for multi-membership users); otherwise the
-- caller's sole membership. Raises if ambiguous so a write can never land in the
-- wrong tenant silently.
create or replace function public.current_tenant_id()
returns text language plpgsql stable security definer set search_path = public as $$
declare v text; n int;
begin
  v := nullif(auth.jwt() -> 'app_metadata' ->> 'active_tenant', '');
  if v is not null and public.has_tenant_access(v) then
    return v;
  end if;
  select count(*) into n from public.current_tenant_ids();
  if n = 1 then
    return (select t from public.current_tenant_ids() t);
  end if;
  raise exception 'No active tenant selected (caller has % accessible tenants). Set app_metadata.active_tenant.', n;
end $$;

grant execute on function public.current_tenant_ids() to authenticated;
grant execute on function public.has_tenant_access(text) to authenticated;
grant execute on function public.current_tenant_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Membership management (SECURITY DEFINER; only super admin / tenant admin)
-- ---------------------------------------------------------------------------
create or replace function public.grant_tenant_access(
  p_email text, p_tenant_id text, p_role text default 'member', p_status text default 'active')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin()
          or exists (select 1 from public.user_tenant_access
                     where tenant_id = p_tenant_id and role in ('owner','admin')
                       and lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
                       and status = 'active')) then
    raise exception 'Only a super admin or a tenant owner/admin may grant access';
  end if;
  insert into public.user_tenant_access (id, email, tenant_id, role, status, created_by)
  values ('uta_' || md5(lower(p_email) || ':' || p_tenant_id), lower(p_email), p_tenant_id,
          p_role, p_status, coalesce(auth.jwt() ->> 'email','system'))
  on conflict (lower(email), tenant_id)
    do update set role = excluded.role, status = excluded.status;
end $$;

create or replace function public.revoke_tenant_access(p_email text, p_tenant_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin()
          or exists (select 1 from public.user_tenant_access
                     where tenant_id = p_tenant_id and role in ('owner','admin')
                       and lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
                       and status = 'active')) then
    raise exception 'Only a super admin or a tenant owner/admin may revoke access';
  end if;
  delete from public.user_tenant_access
    where lower(email) = lower(p_email) and tenant_id = p_tenant_id;
end $$;

grant execute on function public.grant_tenant_access(text,text,text,text) to authenticated;
grant execute on function public.revoke_tenant_access(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RLS on the new tables
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;
drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants for select to authenticated
  using (public.has_tenant_access(id));
-- writes to tenants: super admin only (no client write policy; managed by super admin console via definer RPCs to be added, or dashboard).
drop policy if exists tenants_admin on public.tenants;
create policy tenants_admin on public.tenants for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

alter table public.user_tenant_access enable row level security;
-- A user may READ their own memberships; tenant admins/super admins read their tenant's.
drop policy if exists uta_read on public.user_tenant_access;
create policy uta_read on public.user_tenant_access for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
    or public.is_super_admin()
    or exists (select 1 from public.user_tenant_access m
               where m.tenant_id = user_tenant_access.tenant_id and m.role in ('owner','admin')
                 and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email','')) and m.status='active')
  );
-- No direct client write policy: memberships change only via the SECURITY DEFINER
-- grant_tenant_access / revoke_tenant_access functions above.

-- ---------------------------------------------------------------------------
-- 6. Keep the existing approval flow working under multi-tenancy.
--    Approving a user (super admin action, unchanged UX) now ALSO grants them
--    active membership of the default tenant, so current_tenant_id() resolves
--    and they can read/write their tenant's data. Revoking suspends membership.
--    (Multi-tenant onboarding uses grant_tenant_access() directly per tenant.)
-- ---------------------------------------------------------------------------
create or replace function public.set_user_approval(p_email text, p_approved boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may change approvals';
  end if;
  if p_approved then
    insert into public.approved_users (email, role, approved_by)
    values (lower(p_email), 'User', coalesce(auth.jwt() ->> 'email', 'admin'))
    on conflict (email) do update
      set approved_at = now(), approved_by = excluded.approved_by;
    insert into public.user_tenant_access (id, email, tenant_id, role, status, created_by)
    values ('uta_' || md5(lower(p_email) || ':tnt_sreebalaji'), lower(p_email),
            'tnt_sreebalaji', 'member', 'active', coalesce(auth.jwt() ->> 'email', 'admin'))
    on conflict (lower(email), tenant_id) do update set status = 'active';
  else
    delete from public.approved_users where lower(email) = lower(p_email);
    update public.user_tenant_access set status = 'suspended' where lower(email) = lower(p_email);
  end if;
end $$;
grant execute on function public.set_user_approval(text, boolean) to authenticated;
