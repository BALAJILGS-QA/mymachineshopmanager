-- ============================================================================
-- Migration verification — run BEFORE and AFTER the 0039–0046 rollout and diff.
-- ============================================================================
-- Usage: psql "$DATABASE_URL" -f supabase/verify_migration.sql > before.txt
--        (apply migrations)
--        psql "$DATABASE_URL" -f supabase/verify_migration.sql > after.txt
--        diff before.txt after.txt
--
-- Everything below must be IDENTICAL before vs after, except:
--   • section 9 (orphan / null-tenant checks) which is only meaningful AFTER.
-- No business totals, counts, balances, or GL/AR figures may change.
-- ============================================================================
\pset pager off
\echo '== 1. Row counts (must not change) =='
select 'companies' t, count(*) from companies
union all select 'job_orders', count(*) from job_orders
union all select 'invoices', count(*) from invoices
union all select 'invoice_lines', count(*) from invoice_lines
union all select 'payments', count(*) from payments
union all select 'expenses', count(*) from expenses
union all select 'material_receipts', count(*) from material_receipts
union all select 'material_issues', count(*) from material_issues
union all select 'stock_adjustments', count(*) from stock_adjustments
union all select 'delivery_challans', count(*) from delivery_challans
union all select 'journals', count(*) from journals
union all select 'journal_lines', count(*) from journal_lines
union all select 'bank_transactions', count(*) from bank_transactions
union all select 'employees', count(*) from employees
union all select 'payroll_records', count(*) from payroll_records
union all select 'tool_transactions', count(*) from tool_transactions
order by t;

\echo '== 2. AR / invoice financial invariants (must not change) =='
select round(sum(subtotal),2) subtotal, round(sum(tax_amount),2) tax,
       round(sum(total),2) total, round(sum(paid),2) paid,
       round(sum(outstanding),2) outstanding
from invoice_totals;

\echo '== 3. GL balance — must be 0 (posted journals balanced) =='
select coalesce(sum(l.debit),0) - coalesce(sum(l.credit),0) as gl_imbalance
from journal_lines l join journals j on j.id = l.journal_id
where j.status = 'posted';

\echo '== 4. Trial balance total (debit and credit columns, must not change) =='
select round(sum(total_debit),2) total_debit, round(sum(total_credit),2) total_credit
from trial_balance;

\echo '== 5. Stock balances per material (must not change) =='
select material_id, round(balance,3) balance from material_stock order by material_id;

\echo '== 6. Payment total (must not change) =='
select round(sum(amount),2) total_payments, count(*) n from payments;

\echo '== 7. Payroll totals (must not change) =='
select round(coalesce(sum(net_total),0),2) net, round(coalesce(sum(gross_total),0),2) gross
from payroll_runs;

\echo '== 8. Tool on-hand per tool (must not change) =='
select tool_id, on_hand_qty from tool_inventory order by tool_id;

\echo '== 9. AFTER-ONLY: tenant integrity (every business row must be in a tenant) =='
-- Any nonzero count here means the rollout is incomplete — investigate before go-live.
do $$
declare t text; n int; total int := 0;
begin
  for t in select table_name from information_schema.columns
           where table_schema='public' and column_name='tenant_id' and table_name<>'user_tenant_access'
  loop
    execute format('select count(*) from public.%I where tenant_id is null', t) into n;
    if n > 0 then raise warning 'table % has % null-tenant rows', t, n; total := total + n; end if;
  end loop;
  raise notice 'TOTAL null-tenant business rows: %', total;
end $$;

\echo '== 10. AFTER-ONLY: orphan tenant_id (points at a non-existent tenant) =='
do $$
declare t text; n int; total int := 0;
begin
  for t in select table_name from information_schema.columns
           where table_schema='public' and column_name='tenant_id' and table_name<>'user_tenant_access'
  loop
    execute format('select count(*) from public.%I x left join public.tenants t on t.id=x.tenant_id where x.tenant_id is not null and t.id is null', t) into n;
    if n > 0 then raise warning 'table % has % orphan-tenant rows', t, n; total := total + n; end if;
  end loop;
  raise notice 'TOTAL orphan-tenant business rows: %', total;
end $$;
