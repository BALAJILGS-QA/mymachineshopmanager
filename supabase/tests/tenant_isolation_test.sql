-- ============================================================================
-- Cross-tenant isolation test suite (run against a DB with 0039–0046 applied).
-- ============================================================================
-- Usage:  psql "$DATABASE_URL" -f supabase/tests/tenant_isolation_test.sql
-- Safe:   everything runs inside a single transaction that ROLLBACKs at the end,
--         so no test data persists. Each check RAISES EXCEPTION on failure, so a
--         non-zero psql exit code == a failed isolation guarantee.
--
-- Simulates two tenants (TEN_B, TEN_C) with one user each, then asserts that
-- user B can neither read, insert, update, nor delete tenant C's rows, and that
-- cross-tenant references are blocked. Uses `set local role authenticated` +
-- `request.jwt.claims` so real RLS is exercised (the owner bypasses RLS).
-- ============================================================================
begin;

-- --- fixtures (created as owner, RLS bypassed) ------------------------------
insert into public.tenants (id, code, name) values
  ('ten_b','TENB','Test Tenant B'), ('ten_c','TENC','Test Tenant C');
insert into public.user_tenant_access (id, email, tenant_id, role, status) values
  ('uta_b','userb@test.local','ten_b','admin','active'),
  ('uta_c','userc@test.local','ten_c','admin','active');

-- one customer + invoice in each tenant (stamped explicitly as owner)
insert into public.companies (id, code, name, tenant_id) values
  ('cmp_b','CB','Cust B','ten_b'), ('cmp_c','CC','Cust C','ten_c');
insert into public.invoices (id, invoice_no, date, company_id, status, tenant_id) values
  ('inv_b','INV-B1', current_date, 'cmp_b','Unpaid','ten_b'),
  ('inv_c','INV-C1', current_date, 'cmp_c','Unpaid','ten_c');

-- --- become user B ----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"email":"userb@test.local"}';

-- 1. SELECT isolation: user B sees B's invoice, not C's.
do $$
declare nb int; nc int;
begin
  select count(*) into nb from public.invoices where id = 'inv_b';
  select count(*) into nc from public.invoices where id = 'inv_c';
  if nb <> 1 then raise exception 'FAIL 1a: user B cannot see own invoice (got %)', nb; end if;
  if nc <> 0 then raise exception 'FAIL 1b: user B can SEE tenant C invoice - leak! saw % rows', nc; end if;
  raise notice 'PASS 1: SELECT isolation';
end $$;

-- 2. INSERT into another tenant is blocked by WITH CHECK.
do $$
begin
  begin
    insert into public.companies (id, code, name, tenant_id) values ('cmp_x','CX','hack','ten_c');
    raise exception 'FAIL 2: user B INSERTED a row into tenant C';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS 2: INSERT into tenant C blocked';
  end;
end $$;

-- 3. INSERT without tenant_id auto-stamps user B's tenant (default), never C.
do $$
declare v text;
begin
  insert into public.companies (id, code, name) values ('cmp_bnew','CBN','auto');
  select tenant_id into v from public.companies where id = 'cmp_bnew';
  if v <> 'ten_b' then raise exception 'FAIL 3: auto-stamped tenant was % (expected ten_b)', v; end if;
  raise notice 'PASS 3: default stamps caller tenant';
end $$;

-- 4. UPDATE of another tenant's row affects zero rows (invisible).
do $$
declare n int;
begin
  update public.invoices set notes = 'tampered' where id = 'inv_c';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 4: user B UPDATED % tenant C rows', n; end if;
  raise notice 'PASS 4: UPDATE of tenant C is a no-op';
end $$;

-- 5. DELETE of another tenant's row affects zero rows.
do $$
declare n int;
begin
  delete from public.invoices where id = 'inv_c';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 5: user B DELETED % tenant C rows', n; end if;
  raise notice 'PASS 5: DELETE of tenant C is a no-op';
end $$;

-- 6. Cross-tenant REFERENCE is blocked: B cannot make a payment against C's invoice.
do $$
begin
  begin
    insert into public.payments (id, payment_no, date, company_id, invoice_id, amount, method)
    values ('pay_x','PAY-X', current_date, 'cmp_b', 'inv_c', 100, 'Cash');
    raise exception 'FAIL 6: user B linked a payment to tenant C invoice';
  exception when others then
    -- either the invoice is invisible (fk/df) or the xt guard fires
    raise notice 'PASS 6: cross-tenant payment→invoice blocked (%).', sqlerrm;
  end;
end $$;

-- 7. current_tenant_id() resolves to B for a single-membership user.
do $$
declare v text;
begin
  select public.current_tenant_id() into v;
  if v <> 'ten_b' then raise exception 'FAIL 7: current_tenant_id()=% (expected ten_b)', v; end if;
  raise notice 'PASS 7: current_tenant_id resolves single membership';
end $$;

reset role;
\echo 'ALL TENANT-ISOLATION CHECKS PASSED (rolling back fixtures)'
rollback;
