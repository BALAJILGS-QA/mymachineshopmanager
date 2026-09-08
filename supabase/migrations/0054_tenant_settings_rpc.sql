-- ============================================================================
-- 0054 — Per-tenant settings access (branding isolation follow-up to 0045).
-- ============================================================================
-- Migration 0045 created `tenant_settings` (per-tenant, RLS-isolated) and seeded
-- the SBI row from the app_state singleton, noting the frontend would switch over
-- "in a frontend follow-up". This is that follow-up's server half.
--
-- Until now the frontend read the SHOP PROFILE (company name, logo, numbering,
-- tax defaults …) from the single shared `app_state` (id='singleton') row, so
-- EVERY tenant saw Sree Balaji Industries' configured name + logo. These RPCs let
-- the client read/write ONLY its own tenant's settings, resolving the tenant
-- server-side from the session (never trusting a client-supplied tenant id):
--   * single-membership user  → their tenant
--   * app_metadata.active_tenant claim (multi-membership) → that tenant
--   * super admin (SBI admin)  → the SBI tenant (their home business)
-- A brand-new tenant's row is '{}', so the client merges DEFAULT_SETTINGS and
-- shows the neutral "Machine Shop Manager" brand until the owner configures it.
--
-- Idempotent (create or replace). Also re-syncs the SBI tenant_settings row from
-- the current app_state blob so any edits made AFTER 0045 are preserved.
-- ============================================================================

-- Re-sync SBI's per-tenant settings from the live singleton (captures any edits
-- made since 0045 seeded it). Other tenants keep their own '{}' / configured data.
update public.tenant_settings ts
   set data = coalesce((select data -> 'settings' from public.app_state where id = 'singleton'), '{}'::jsonb),
       updated_at = now()
 where ts.tenant_id = 'tnt_sreebalaji';

-- Resolve which tenant's settings the caller should read/write.
create or replace function public.settings_tenant_id()
returns text language plpgsql stable security definer set search_path = public as $$
declare v text; n int;
begin
  -- Honor an explicit active-tenant claim if the caller may access it.
  v := nullif(auth.jwt() -> 'app_metadata' ->> 'active_tenant', '');
  if v is not null and public.has_tenant_access(v) then
    return v;
  end if;
  -- A user with exactly one active membership → that tenant.
  select count(*) into n from public.user_tenant_access
   where lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) and status = 'active';
  if n = 1 then
    return (select tenant_id from public.user_tenant_access
             where lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) and status = 'active'
             limit 1);
  end if;
  -- Super admin (or any residual multi-membership): default to the home tenant.
  if public.is_super_admin() then
    return 'tnt_sreebalaji';
  end if;
  raise exception 'No active tenant selected for settings (caller has % memberships)', n;
end $$;
grant execute on function public.settings_tenant_id() to authenticated;

-- Read the caller-tenant settings blob (the raw settings object, or '{}').
create or replace function public.get_tenant_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tenant text; v jsonb;
begin
  v_tenant := public.settings_tenant_id();
  select data into v from public.tenant_settings where tenant_id = v_tenant;
  return coalesce(v, '{}'::jsonb);
end $$;
grant execute on function public.get_tenant_settings() to authenticated;

-- Overwrite the caller-tenant settings blob (client sends the fully-merged object).
create or replace function public.set_tenant_settings(p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant text;
begin
  if not public.is_app_approved() then
    raise exception 'Not authorized to update settings';
  end if;
  v_tenant := public.settings_tenant_id();
  insert into public.tenant_settings (tenant_id, data, updated_at)
       values (v_tenant, coalesce(p_data, '{}'::jsonb), now())
  on conflict (tenant_id) do update set data = excluded.data, updated_at = now();
  return coalesce(p_data, '{}'::jsonb);
end $$;
grant execute on function public.set_tenant_settings(jsonb) to authenticated;
