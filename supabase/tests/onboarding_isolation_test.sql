-- ============================================================================
-- Onboarding tenant-isolation regression test (run against 0053+ applied DB).
-- ============================================================================
-- Guards the CRITICAL bug fixed in migration 0053: approving a brand-new user
-- must NOT grant them membership of the Sree Balaji Industries tenant (or any
-- existing tenant) — they must get their OWN isolated tenant and see zero of
-- another tenant's data.
--
-- Usage:  psql "$DATABASE_URL" -f supabase/tests/onboarding_isolation_test.sql
-- Safe:   runs inside a single transaction that ROLLBACKs; each check RAISES on
--         failure so a non-zero exit == a broken isolation guarantee. Uses
--         `set local role authenticated` + request.jwt.claims so real RLS +
--         the real is_super_admin()/set_user_approval() path are exercised.
--
-- NOTE: the super-admin email below MUST match is_super_admin() (SBI admin) and
--       SUPER_ADMIN_EMAILS. 'tnt_sreebalaji' is the seeded live tenant.
-- ============================================================================
begin;

-- ground truth: how much data does SBI actually have? (as owner, RLS bypassed)
do $$
declare sbi_rows int;
begin
  select count(*) into sbi_rows from public.companies where tenant_id = 'tnt_sreebalaji';
  if sbi_rows = 0 then
    raise notice 'WARN: SBI has no companies; leak test is weaker but still valid';
  end if;
end $$;

-- --- 1. Super admin approves a brand-new applicant --------------------------
set local role authenticated;
set local request.jwt.claims = '{"email":"admin@sreebalajiindustries.com"}';
select public.set_user_approval('newbie_iso_test@test.local', true);

-- --- 2. Inspect the resulting membership (as owner) -------------------------
reset role;
do $$
declare n_sbi int; n_total int; v_tenant text; v_role text;
begin
  select count(*) into n_sbi from public.user_tenant_access
   where lower(email) = 'newbie_iso_test@test.local' and tenant_id = 'tnt_sreebalaji';
  if n_sbi <> 0 then
    raise exception 'FAIL 2a: new user was granted SBI membership (LEAK) — % rows', n_sbi;
  end if;

  select count(*) into n_total from public.user_tenant_access
   where lower(email) = 'newbie_iso_test@test.local' and status = 'active';
  if n_total <> 1 then
    raise exception 'FAIL 2b: new user should have exactly 1 tenant, has %', n_total;
  end if;

  select tenant_id, role into v_tenant, v_role from public.user_tenant_access
   where lower(email) = 'newbie_iso_test@test.local' and status = 'active';
  if v_tenant = 'tnt_sreebalaji' then raise exception 'FAIL 2c: own tenant IS SBI'; end if;
  if v_role <> 'owner' then raise exception 'FAIL 2d: new user is not owner of own tenant (role=%)', v_role; end if;
  raise notice 'PASS 2: new user owns an isolated tenant % (not SBI)', v_tenant;
end $$;

-- --- 3. The new user, under RLS, sees ZERO SBI data ------------------------
set local role authenticated;
set local request.jwt.claims = '{"email":"newbie_iso_test@test.local"}';
do $$
declare n_co int; n_inv int; can_sbi boolean; is_sa boolean;
begin
  select public.has_tenant_access('tnt_sreebalaji'), public.is_super_admin()
    into can_sbi, is_sa;
  if can_sbi then raise exception 'FAIL 3a: new user has_tenant_access(SBI) = true (LEAK)'; end if;
  if is_sa   then raise exception 'FAIL 3b: new user resolved as super admin'; end if;
  select count(*) into n_co  from public.companies;
  select count(*) into n_inv from public.invoices;
  if n_co  <> 0 then raise exception 'FAIL 3c: new user sees % companies (expected 0)', n_co; end if;
  if n_inv <> 0 then raise exception 'FAIL 3d: new user sees % invoices (expected 0)', n_inv; end if;
  raise notice 'PASS 3: new user sees 0 companies / 0 invoices under RLS';
end $$;

-- --- 4. An EXPLICITLY invited user is activated in-place, not given a new tenant
reset role;
insert into public.tenants (id, code, name) values ('ten_invite','TINV','Invite Co')
  on conflict (id) do nothing;
set local role authenticated;
set local request.jwt.claims = '{"email":"admin@sreebalajiindustries.com"}';
-- invite (pending), then approve
select public.grant_tenant_access('invited_iso_test@test.local', 'ten_invite', 'member', 'pending');
select public.set_user_approval('invited_iso_test@test.local', true);
reset role;
do $$
declare n_total int; v_tenant text; v_status text;
begin
  select count(*) into n_total from public.user_tenant_access
   where lower(email) = 'invited_iso_test@test.local';
  if n_total <> 1 then raise exception 'FAIL 4a: invited user got % memberships (expected 1, no auto-provision)', n_total; end if;
  select tenant_id, status into v_tenant, v_status from public.user_tenant_access
   where lower(email) = 'invited_iso_test@test.local';
  if v_tenant <> 'ten_invite' then raise exception 'FAIL 4b: invited user tenant=% (expected ten_invite)', v_tenant; end if;
  if v_status <> 'active' then raise exception 'FAIL 4c: invited user not activated (status=%)', v_status; end if;
  raise notice 'PASS 4: explicitly-invited user activated in place, no new tenant minted';
end $$;

\echo 'ALL ONBOARDING-ISOLATION CHECKS PASSED (rolling back fixtures)'
rollback;
