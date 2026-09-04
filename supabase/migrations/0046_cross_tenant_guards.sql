-- ============================================================================
-- Multi-tenant rollout, part 4: cross-tenant reference guards (defense in depth).
-- ============================================================================
-- 0044 already enforces that a caller can only INSERT rows into a tenant they
-- belong to (RLS WITH CHECK on tenant_id) and DEFAULT-stamps tenant_id. This
-- migration closes the remaining IDOR path: a row must not REFERENCE a parent in
-- a DIFFERENT tenant (e.g. a payment pointing at another tenant's invoice, a
-- journal_line pointing at another tenant's account, a tool_move against another
-- tenant's tool). Because SECURITY DEFINER RPCs (post_journal, post_bank_txn,
-- tool_move, …) bypass RLS, this is enforced with triggers that fire regardless
-- of who writes — so we do NOT have to rewrite every RPC body.
--
-- Each guard raises if NEW.tenant_id <> parent.tenant_id. Nulls (optional FKs
-- not set) are skipped. All functions pin search_path.
--
-- See docs/MULTI_TENANT_DESIGN.md §9.
-- Idempotent.
-- ============================================================================

-- Generic helper: assert a referenced row is in the same tenant.
create or replace function public.assert_ref_tenant(
  p_child_tenant text, p_table regclass, p_id text)
returns void language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if p_id is null then return; end if;
  execute format('select tenant_id from %s where id = $1', p_table) into v using p_id;
  if v is not null and v <> p_child_tenant then
    raise exception 'Cross-tenant reference blocked: % % belongs to tenant %, not %',
      p_table, p_id, v, p_child_tenant;
  end if;
end $$;

-- --- invoice_lines → invoices / job_orders / materials -----------------------
create or replace function public.guard_xt_invoice_lines()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.invoices',   new.invoice_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_orders', new.job_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.materials',  new.material_id);
  return new;
end $$;
drop trigger if exists trg_xt_invoice_lines on public.invoice_lines;
create trigger trg_xt_invoice_lines before insert or update on public.invoice_lines
  for each row execute function public.guard_xt_invoice_lines();

-- --- payments → invoices / companies -----------------------------------------
create or replace function public.guard_xt_payments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.invoices',  new.invoice_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.companies',  new.company_id);
  return new;
end $$;
drop trigger if exists trg_xt_payments on public.payments;
create trigger trg_xt_payments before insert or update on public.payments
  for each row execute function public.guard_xt_payments();

-- --- invoices → companies ----------------------------------------------------
create or replace function public.guard_xt_invoices()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.companies', new.company_id);
  return new;
end $$;
drop trigger if exists trg_xt_invoices on public.invoices;
create trigger trg_xt_invoices before insert or update on public.invoices
  for each row execute function public.guard_xt_invoices();

-- --- job_orders → companies / materials --------------------------------------
create or replace function public.guard_xt_job_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.companies', new.company_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.materials', new.material_id);
  return new;
end $$;
drop trigger if exists trg_xt_job_orders on public.job_orders;
create trigger trg_xt_job_orders before insert or update on public.job_orders
  for each row execute function public.guard_xt_job_orders();

-- --- journal_lines → journals / chart_of_accounts ----------------------------
create or replace function public.guard_xt_journal_lines()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.journals',          new.journal_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.chart_of_accounts', new.account_id);
  return new;
end $$;
drop trigger if exists trg_xt_journal_lines on public.journal_lines;
create trigger trg_xt_journal_lines before insert or update on public.journal_lines
  for each row execute function public.guard_xt_journal_lines();

-- --- bank_transactions → bank_accounts / invoices / chart_of_accounts --------
create or replace function public.guard_xt_bank_txns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.bank_accounts',     new.bank_account_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.invoices',          new.matched_invoice_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.chart_of_accounts', new.matched_ledger_account_id);
  return new;
end $$;
drop trigger if exists trg_xt_bank_txns on public.bank_transactions;
create trigger trg_xt_bank_txns before insert or update on public.bank_transactions
  for each row execute function public.guard_xt_bank_txns();

-- --- material ledgers → materials / companies / job_orders -------------------
create or replace function public.guard_xt_material_issue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.materials',  new.material_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.companies',  new.company_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_orders', new.job_id);
  return new;
end $$;
drop trigger if exists trg_xt_material_issue on public.material_issues;
create trigger trg_xt_material_issue before insert or update on public.material_issues
  for each row execute function public.guard_xt_material_issue();

create or replace function public.guard_xt_material_receipt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.materials',  new.material_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.companies',  new.company_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_orders', new.job_id);
  return new;
end $$;
drop trigger if exists trg_xt_material_receipt on public.material_receipts;
create trigger trg_xt_material_receipt before insert or update on public.material_receipts
  for each row execute function public.guard_xt_material_receipt();

-- --- tool_transactions → tools / job_orders ----------------------------------
create or replace function public.guard_xt_tool_txns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.tools',      new.tool_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_orders', new.job_id);
  return new;
end $$;
drop trigger if exists trg_xt_tool_txns on public.tool_transactions;
create trigger trg_xt_tool_txns before insert or update on public.tool_transactions
  for each row execute function public.guard_xt_tool_txns();

-- --- delivery_challans → companies / job_orders / invoices -------------------
create or replace function public.guard_xt_challans()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.companies',  new.company_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_orders', new.job_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.invoices',   new.invoice_id);
  return new;
end $$;
drop trigger if exists trg_xt_challans on public.delivery_challans;
create trigger trg_xt_challans before insert or update on public.delivery_challans
  for each row execute function public.guard_xt_challans();
