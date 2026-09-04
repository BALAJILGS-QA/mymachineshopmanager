-- ============================================================================
-- Multi-tenant rollout, part 1: add nullable tenant_id everywhere + backfill.
-- ============================================================================
-- Adds tenant_id (nullable) to every tenant-owned table, backfills all existing
-- rows to the seeded Sree Balaji tenant, then VERIFIES zero nulls remain (and
-- ABORTS if any table failed to backfill). tenant_id is made NOT NULL and RLS is
-- switched to tenant isolation in 0044 — split in two so a backfill problem
-- never leaves a NOT NULL column half-populated.
--
-- Global/reference tables intentionally EXCLUDED (no tenant_id):
--   hr_permissions, hr_roles, hr_role_permissions (RBAC catalog),
--   gst_tax_rates, hsn_codes (statutory reference),
--   tenants, user_tenant_access, approved_users, doc_counters, app_state.
--
-- See docs/MULTI_TENANT_DESIGN.md §4.
-- Idempotent: add column if not exists; backfill only null rows.
-- ============================================================================

do $$
declare
  t text;
  n int;
  tenant_tables text[] := array[
    -- sales / AR
    'companies','products','job_orders','production_events','invoices','invoice_lines',
    'payments','delivery_challans','expenses',
    -- inventory
    'materials','material_receipts','material_issues','stock_adjustments',
    'stock_transfers','own_material_purchases',
    -- purchasing
    'vendors','subcontract_orders','subcontract_docs',
    -- accounting
    'chart_of_accounts','fiscal_years','accounting_periods','journals',
    'journal_lines','bank_accounts',
    -- banking
    'bank_statement_files','bank_transactions','bank_txn_rules','party_aliases',
    -- gst
    'gst_registrations','gst_return_periods','einvoice_records','eway_bills',
    -- hrm core
    'departments','designations','employees','employee_status_history','shifts',
    'shift_assignments','holidays','leave_types','leave_balances',
    'leave_applications','attendance',
    -- hrm payroll & lifecycle
    'salary_components','salary_structures','salary_structure_lines','employee_salary',
    'payroll_periods','payroll_runs','payroll_records','document_types',
    'employee_documents','employee_assets','asset_assignments','employee_advances',
    'advance_repayments','expense_categories','expense_claims','job_openings',
    'candidates','interview_rounds','job_offers','performance_cycles',
    'performance_reviews','performance_goals','training_programs',
    'training_sessions','employee_training',
    -- tool room
    'tool_categories','tools','tool_transactions','tool_reservations',
    'tool_maintenance','tool_calibrations',
    -- platform (per-tenant)
    'notifications','hr_audit_log','audit_log','hr_user_roles','hr_settings'
  ];
begin
  -- 1. add nullable column + backfill
  foreach t in array tenant_tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'Expected table public.% not found — aborting tenant rollout', t;
    end if;
    execute format(
      'alter table public.%I add column if not exists tenant_id text references public.tenants(id)', t);
    execute format(
      'update public.%I set tenant_id = %L where tenant_id is null', t, 'tnt_sreebalaji');
  end loop;

  -- 2. verify zero nulls remain (abort if any table failed to backfill)
  foreach t in array tenant_tables loop
    execute format('select count(*) from public.%I where tenant_id is null', t) into n;
    if n > 0 then
      raise exception 'ABORT: table public.% still has % rows with null tenant_id', t, n;
    end if;
  end loop;

  raise notice 'tenant_id added + backfilled on % tables', array_length(tenant_tables,1);
end $$;
