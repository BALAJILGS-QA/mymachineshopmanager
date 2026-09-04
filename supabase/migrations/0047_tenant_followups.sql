-- ============================================================================
-- Multi-tenant follow-ups (audit/review H-1, H-3): make tenant onboarding safe.
-- ============================================================================
-- Not required for the current single tenant; REQUIRED before onboarding a 2nd.
-- Additive + backward-compatible with the existing Sree Balaji tenant.
--
--  H-1  acc_unallocated_customer() → per-tenant system customer (was a single
--       shared fixed id, which under multi-tenancy would be owned by the first
--       tenant and blocked by the 0046 cross-tenant guard for everyone else).
--  H-3a hr_next_employee_code() → reads/writes the CALLER'S tenant hr_settings
--       row (was hard-coded to id='singleton', i.e. only the SBI tenant).
--  H-3b provision_tenant() → one call to create a tenant + seed its settings +
--       grant its owner, so a new tenant is immediately usable.
--
-- See docs/DATABASE_FINAL_REVIEW.md and docs/MULTI_TENANT_DESIGN.md.
-- Idempotent (create or replace).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- H-1: per-tenant "Unallocated Bank Receipts" system customer.
--      Re-emits the 0038 function; each tenant gets its own system customer so
--      an unmatched credit always lands on an in-tenant company (never blocked
--      by the cross-tenant guard). Existing SBI rows that reference the old
--      'sys_unallocated_receipts' id remain valid.
-- ---------------------------------------------------------------------------
create or replace function public.acc_unallocated_customer()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_tenant text := public.current_tenant_id();
  v_id text := 'sys_unalloc_' || v_tenant;
begin
  insert into public.companies (id, code, name, active, notes, tenant_id)
  values (v_id, 'SYS-UNALLOC-' || v_tenant, 'Unallocated Bank Receipts', true,
          'System party for bank receipts that could not be matched to a customer. Re-assign to the real customer once identified.',
          v_tenant)
  on conflict (id) do nothing;
  return v_id;
end $$;
grant execute on function public.acc_unallocated_customer() to authenticated;

-- ---------------------------------------------------------------------------
-- H-3a: tenant-aware employee-code sequence.
--       Reads the caller-tenant hr_settings row (preferring the legacy
--       'singleton' row for SBI); creates one on demand for a new tenant.
-- ---------------------------------------------------------------------------
create or replace function public.hr_next_employee_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb; prefix text; padding int; nextno bigint; code text;
  v_tenant text := public.current_tenant_id();
  v_id text;
begin
  if not public.is_app_approved() then
    raise exception 'Not authorized to create employees';
  end if;
  select id, data into v_id, cfg from public.hr_settings
    where tenant_id = v_tenant
    order by (id = 'singleton') desc
    limit 1
    for update;
  if v_id is null then
    v_id := 'hrset_' || v_tenant;
    insert into public.hr_settings (id, data, tenant_id)
      values (v_id, '{}'::jsonb, v_tenant)
      on conflict (id) do nothing;
    cfg := '{}'::jsonb;
  end if;
  cfg := coalesce(cfg, '{}'::jsonb);
  prefix  := coalesce(cfg #>> '{employeeCode,prefix}', 'EMP-');
  padding := coalesce((cfg #>> '{employeeCode,padding}')::int, 6);
  nextno  := coalesce((cfg #>> '{employeeCode,next}')::bigint, 1);
  code := prefix || lpad(nextno::text, padding, '0');
  update public.hr_settings
    set data = jsonb_set(cfg, '{employeeCode,next}', to_jsonb(nextno + 1), true),
        updated_at = now()
    where id = v_id;
  return code;
end $$;
grant execute on function public.hr_next_employee_code() to authenticated;

-- ---------------------------------------------------------------------------
-- H-3b: one-shot tenant provisioning (super admin only).
-- ---------------------------------------------------------------------------
create or replace function public.provision_tenant(
  p_id text, p_code text, p_name text,
  p_owner_email text default null, p_legal_name text default null, p_gstin text default null)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may provision a tenant';
  end if;
  insert into public.tenants (id, code, name, legal_name, gstin)
    values (p_id, p_code, p_name, p_legal_name, p_gstin)
    on conflict (id) do nothing;
  insert into public.tenant_settings (tenant_id, data)
    values (p_id, '{}'::jsonb)
    on conflict (tenant_id) do nothing;
  insert into public.hr_settings (id, data, tenant_id)
    values ('hrset_' || p_id, '{}'::jsonb, p_id)
    on conflict (id) do nothing;
  if p_owner_email is not null and length(trim(p_owner_email)) > 0 then
    perform public.grant_tenant_access(lower(p_owner_email), p_id, 'owner', 'active');
    insert into public.approved_users (email, role, approved_by)
      values (lower(p_owner_email), 'Owner', coalesce(auth.jwt() ->> 'email', 'system'))
      on conflict (email) do nothing;
  end if;
  return p_id;
end $$;
grant execute on function public.provision_tenant(text,text,text,text,text,text) to authenticated;
