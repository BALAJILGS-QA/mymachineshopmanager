-- ============================================================================
-- 0053 — Onboarding tenant-isolation fix (CRITICAL security fix).
-- ============================================================================
-- ROOT CAUSE (found 2026-09-08): the multi-tenant RLS engine (0042–0048) is
-- correct — every tenant-owned table is gated by has_tenant_access(tenant_id).
-- BUT `set_user_approval()` (introduced in 0042) UNCONDITIONALLY inserted an
-- active membership of tenant 'tnt_sreebalaji' (Sree Balaji Industries) for EVERY
-- user a super admin approved. That shortcut (meant to keep the single existing
-- SBI userbase working during the single→multi tenant cut-over) means every
-- brand-new self-serve signup, once approved, becomes a member of SBI and can see
-- ALL of SBI's data. That is exactly how nbalaji4325@gmail.com saw SBI data.
--
-- FIX (chosen onboarding model: self-serve — each new user owns their own tenant):
--   A. Rewrite set_user_approval so approval NEVER auto-grants SBI. A newly
--      approved user with no prior membership gets a fresh, isolated tenant they
--      own (seeded like provision_tenant). A user who already has a pending/active
--      membership (i.e. was explicitly invited to a tenant) is simply activated.
--   B. Close latent cross-tenant leaks on legacy tables still gated only by
--      is_app_approved() with no tenant filter: suppliers, subcontracts (empty
--      legacy business tables) get tenant_id + tenant_isolation; contact_messages
--      (public inbound, world-readable to any authenticated user) is scoped to the
--      site-owner tenant (SBI) while keeping anonymous INSERT open.
--   C. Remediate the already-affected account: strip nbalaji4325@gmail.com's SBI
--      membership and give them their own isolated tenant.
--
-- Idempotent (create or replace / add column if not exists / guarded DO blocks).
-- Additive & backward-compatible: the existing SBI userbase and their memberships
-- are untouched.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: provision (or return) an isolated tenant OWNED by p_email.
-- Internal only — callable by the SECURITY DEFINER functions below, NOT by
-- ordinary clients (execute is revoked from public/authenticated so it can never
-- be used to self-provision tenants directly).
-- ---------------------------------------------------------------------------
create or replace function public.provision_isolated_tenant_for(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email   text := lower(btrim(p_email));
  v_company text;
  v_tenant  text;
  v_code    text;
  v_name    text;
  v_existing text;
begin
  if v_email = '' then
    raise exception 'Email is required to provision a tenant';
  end if;

  -- If the user already belongs to a non-suspended tenant, reuse it (never mint
  -- a duplicate). Prefer an already-owned tenant.
  select tenant_id into v_existing
    from public.user_tenant_access
   where lower(email) = v_email and status in ('active','pending')
   order by (role = 'owner') desc
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Derive a friendly name/code from the applicant's signup profile.
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

  insert into public.tenants (id, code, name, legal_name)
  values (v_tenant, v_code, v_name, v_name)
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
revoke execute on function public.provision_isolated_tenant_for(text) from public;
-- (intentionally NOT granted to authenticated — internal use only)

-- ---------------------------------------------------------------------------
-- A. Approval no longer dumps users into SBI.
-- ---------------------------------------------------------------------------
create or replace function public.set_user_approval(p_email text, p_approved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email   text := lower(btrim(p_email));
  v_has_mem boolean;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may change approvals';
  end if;
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  if p_approved then
    insert into public.approved_users (email, role, approved_by)
    values (v_email, 'User', coalesce(auth.jwt() ->> 'email', 'admin'))
    on conflict (email) do update
      set approved_at = now(), approved_by = excluded.approved_by;

    -- Was the user explicitly invited to a tenant already? (pending/active row)
    select exists (
      select 1 from public.user_tenant_access
       where lower(email) = v_email and status in ('active','pending')
    ) into v_has_mem;

    if v_has_mem then
      -- Activate exactly the tenant(s) they were invited to. SBI is never added.
      update public.user_tenant_access
         set status = 'active'
       where lower(email) = v_email and status in ('active','pending');
    else
      -- Self-serve: give them their own isolated tenant.
      perform public.provision_isolated_tenant_for(v_email);
    end if;
  else
    delete from public.approved_users where lower(email) = v_email;
    update public.user_tenant_access set status = 'suspended' where lower(email) = v_email;
  end if;
end $$;
grant execute on function public.set_user_approval(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- B1. Legacy business tables gated only by is_app_approved() → tenant_isolation.
--     suppliers & subcontracts are empty, so adding NOT NULL tenant_id is safe.
-- ---------------------------------------------------------------------------
do $$
declare t text; p text;
begin
  foreach t in array array['suppliers','subcontracts'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists tenant_id text', t);
    execute format('alter table public.%I alter column tenant_id set default public.current_tenant_id()', t);
    -- backfill any stray existing rows to SBI (there are none today) so NOT NULL holds
    execute format('update public.%I set tenant_id = ''tnt_sreebalaji'' where tenant_id is null', t);
    execute format('alter table public.%I alter column tenant_id set not null', t);
    execute format('create index if not exists idx_%s_tenant on public.%I (tenant_id)', t, t);
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated '
      'using (public.has_tenant_access(tenant_id)) '
      'with check (public.has_tenant_access(tenant_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- B2. contact_messages: public inbound leads for the marketing site (SBI-owned).
--     Was world-readable to ANY authenticated user (select/update/delete USING
--     true) — a cross-tenant read once other tenants exist. Scope reads/writes to
--     the owning tenant; keep INSERT open so the public /contact form still works.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.contact_messages') is not null then
    alter table public.contact_messages add column if not exists tenant_id text;
    update public.contact_messages set tenant_id = 'tnt_sreebalaji' where tenant_id is null;
    alter table public.contact_messages alter column tenant_id set default 'tnt_sreebalaji';
    alter table public.contact_messages alter column tenant_id set not null;
    create index if not exists idx_contact_messages_tenant on public.contact_messages (tenant_id);

    drop policy if exists contact_messages_select on public.contact_messages;
    drop policy if exists contact_messages_update on public.contact_messages;
    drop policy if exists contact_messages_delete on public.contact_messages;
    -- contact_messages_insert (USING/CHECK true, to anon) is left intact.
    create policy contact_messages_select on public.contact_messages for select to authenticated
      using (public.has_tenant_access(tenant_id));
    create policy contact_messages_update on public.contact_messages for update to authenticated
      using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
    create policy contact_messages_delete on public.contact_messages for delete to authenticated
      using (public.has_tenant_access(tenant_id));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- C. Remediate the already-affected account.
--    Remove nbalaji4325@gmail.com's erroneous SBI membership and give them their
--    own isolated tenant (they remain approved).
-- ---------------------------------------------------------------------------
do $$
declare v_email text := 'nbalaji4325@gmail.com'; v_tenant text;
begin
  delete from public.user_tenant_access
   where lower(email) = v_email and tenant_id = 'tnt_sreebalaji';
  v_tenant := public.provision_isolated_tenant_for(v_email);
  raise notice 'Remediated %: now owner of isolated tenant %', v_email, v_tenant;
end $$;
