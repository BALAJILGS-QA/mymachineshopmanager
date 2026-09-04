-- ============================================================================
-- Multi-tenant view security: make reporting views honor the caller's RLS.
-- ============================================================================
-- CRITICAL for isolation. A normal Postgres view runs with the VIEW OWNER's
-- privileges, which BYPASSES row-level security on the base tables. After 0044
-- the base tables are tenant-isolated, but these views would still return EVERY
-- tenant's rows to any caller — a cross-tenant leak through reporting.
--
-- `security_invoker = on` (PostgreSQL 15+) makes each view execute with the
-- querying user's privileges, so the base-table tenant_isolation RLS applies and
-- each caller sees only their own tenant's aggregates. Supabase runs PG15+.
--
-- No behaviour change for the current single tenant (an SBI user already sees all
-- SBI rows). Idempotent; guarded on server version.
-- See docs/DATABASE_AUDIT_REPORT.md §4 and docs/MULTI_TENANT_DESIGN.md §5.
-- ============================================================================
do $$
declare
  v text;
  views text[] := array[
    'material_stock','material_receipt_stock','inventory_ledger',
    'invoice_totals','general_ledger','trial_balance','tool_inventory'
  ];
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'security_invoker views require PostgreSQL 15+; found %', current_setting('server_version');
  end if;
  foreach v in array views loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = on)', v);
    else
      raise notice 'view public.% not found — skipped', v;
    end if;
  end loop;
end $$;
