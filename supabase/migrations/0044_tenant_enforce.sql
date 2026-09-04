-- ============================================================================
-- Multi-tenant rollout, part 2: enforce isolation.
-- ============================================================================
-- For every tenant-owned table (identified as "has a tenant_id column", added in
-- 0042) this migration:
--   1. sets DEFAULT current_tenant_id()  → new rows auto-stamp the caller's
--      tenant, so EXISTING RPCs and generic CRUD keep working WITHOUT change
--      (no NOT NULL break); the client never supplies tenant_id.
--   2. sets tenant_id NOT NULL.
--   3. creates idx_<table>_tenant.
--   4. replaces every existing policy with a single tenant_isolation policy:
--         using / with check = has_tenant_access(tenant_id)
--      WITH CHECK blocks writing a row into a tenant the caller can't access —
--      closing the "tamper tenant_id" path.
--
-- Ledger tables written only via SECURITY DEFINER RPCs (journal_lines,
-- tool_transactions, hr_audit_log) and the personal notifications table get
-- bespoke policies instead of the uniform one. SECURITY DEFINER functions run as
-- the table owner and bypass RLS, but the DEFAULT still stamps tenant_id, so
-- posting/tool-move/audit/notify keep working and remain the only writers.
--
-- Also re-scopes global business-identifier uniques to (tenant_id, <id>) so the
-- same invoice/doc numbers can exist in different tenants (audit finding H1).
--
-- See docs/MULTI_TENANT_DESIGN.md §5–§6.
-- Idempotent where practical.
-- ============================================================================

-- Flush any deferred constraint/trigger events from a prior migration so the
-- ALTER TABLEs below cannot fail with "pending trigger events" if this file is
-- applied in a shared transaction with 0040 (no-op under normal per-file apply).
set constraints all immediate;

-- ---------------------------------------------------------------------------
-- 1–4. Per-table default / not null / index / RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
  special text[] := array['journal_lines','tool_transactions','hr_audit_log','notifications'];
begin
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'tenant_id'
       and table_name <> 'user_tenant_access'
     order by table_name
  loop
    execute format('alter table public.%I alter column tenant_id set default public.current_tenant_id()', t);
    execute format('alter table public.%I alter column tenant_id set not null', t);
    execute format('create index if not exists idx_%s_tenant on public.%I (tenant_id)', t, t);

    if not (t = any(special)) then
      -- drop every existing policy, then install the uniform tenant policy
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy if exists %I on public.%I', p, t);
      end loop;
      execute format('alter table public.%I enable row level security', t);
      execute format(
        'create policy tenant_isolation on public.%I for all to authenticated '
        'using (public.has_tenant_access(tenant_id)) '
        'with check (public.has_tenant_access(tenant_id))', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Special tables: read-scoped to tenant; writes only via SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------
-- journal_lines — written only by post_journal(); read within tenant.
do $$ declare p text; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='journal_lines' loop
    execute format('drop policy if exists %I on public.journal_lines', p);
  end loop;
end $$;
create policy jl_tenant_read on public.journal_lines for select to authenticated
  using (public.has_tenant_access(tenant_id));

-- tool_transactions — written only by tool_move(); read within tenant.
do $$ declare p text; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='tool_transactions' loop
    execute format('drop policy if exists %I on public.tool_transactions', p);
  end loop;
end $$;
create policy tt_tenant_read on public.tool_transactions for select to authenticated
  using (public.has_tenant_access(tenant_id));

-- hr_audit_log — written only by hr_log(); read within tenant.
do $$ declare p text; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='hr_audit_log' loop
    execute format('drop policy if exists %I on public.hr_audit_log', p);
  end loop;
end $$;
create policy hal_tenant_read on public.hr_audit_log for select to authenticated
  using (public.has_tenant_access(tenant_id));

-- notifications — personal: recipient (or super admin) reads/updates within tenant;
-- inserts happen via hr_notify().
do $$ declare p text; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='notifications' loop
    execute format('drop policy if exists %I on public.notifications', p);
  end loop;
end $$;
create policy notif_tenant_read on public.notifications for select to authenticated
  using (public.has_tenant_access(tenant_id)
         and (lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email','')) or public.is_super_admin()));
create policy notif_tenant_update on public.notifications for update to authenticated
  using (public.has_tenant_access(tenant_id)
         and lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email','')))
  with check (public.has_tenant_access(tenant_id));

-- ---------------------------------------------------------------------------
-- 6. Re-scope global business-identifier uniques to (tenant_id, <identifier>).
--    Existing single-tenant data satisfies these unchanged. Inline UNIQUE
--    constraints are named <table>_<column>_key by Postgres.
-- ---------------------------------------------------------------------------
do $$
declare
  r text[];
  rescopes text[][] := array[
    ['companies','code','companies_code_key'],
    ['products','code','products_code_key'],
    ['materials','code','materials_code_key'],
    ['vendors','code','vendors_code_key'],
    ['job_orders','job_no','job_orders_job_no_key'],
    ['invoices','invoice_no','invoices_invoice_no_key'],
    ['payments','payment_no','payments_payment_no_key'],
    ['material_receipts','receipt_no','material_receipts_receipt_no_key'],
    ['material_issues','issue_no','material_issues_issue_no_key'],
    ['stock_adjustments','adj_no','stock_adjustments_adj_no_key'],
    ['expenses','expense_no','expenses_expense_no_key'],
    ['delivery_challans','dc_no','delivery_challans_dc_no_key'],
    ['subcontract_orders','sc_no','subcontract_orders_sc_no_key'],
    ['tools','code','tools_code_key']
  ];
begin
  foreach r slice 1 in array rescopes loop
    execute format('alter table public.%I drop constraint if exists %I', r[1], r[3]);
    execute format(
      'create unique index if not exists uq_%s_tenant_%s on public.%I (tenant_id, %I)',
      r[1], r[2], r[1], r[2]);
  end loop;
end $$;

-- journals.journal_no: replace the global unique from 0040 with a tenant-scoped one.
drop index if exists public.uq_journals_journal_no;
create unique index if not exists uq_journals_tenant_no on public.journals (tenant_id, journal_no);
