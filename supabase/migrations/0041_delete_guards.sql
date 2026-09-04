-- ============================================================================
-- Delete guards: protect POSTED / FINALIZED / STATUTORY history from being
-- erased by cascade deletes.
-- ============================================================================
-- Addresses audit finding C3 (dangerous ON DELETE CASCADE FKs).
--
-- DESIGN CHOICE — why triggers, not FK repointing:
--   Repointing the flagged FKs to RESTRICT would BREAK existing behaviour. In
--   particular hr_run_payroll() deletes DRAFT payroll_runs to re-run, relying on
--   the payroll_records → payroll_runs CASCADE to clean up their draft records.
--   A blanket RESTRICT would make re-running payroll fail. So instead we keep the
--   cascades (draft cleanup still works) and add BEFORE DELETE guards on the
--   PARENT tables that block deletion only when the record is in a protected
--   (posted / finalized / statutory) state. Draft/void/cancelled cleanup is
--   unaffected. Deletion path of choice for posted records remains the soft
--   route (void_journal / set_invoice_status = 'Cancelled').
--
-- NON-DESTRUCTIVE: adds triggers only; no data or schema columns change.
-- Idempotent: create or replace function + drop/create trigger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. journals: block DELETE of a POSTED journal (protects journal_lines GL).
--    Drafts and voids may still be deleted (cascade clears their lines).
-- ---------------------------------------------------------------------------
create or replace function public.guard_delete_journal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'posted' then
    raise exception 'Cannot delete posted journal % — void it with void_journal() instead', old.id;
  end if;
  return old;
end $$;
drop trigger if exists trg_guard_delete_journal on public.journals;
create trigger trg_guard_delete_journal
  before delete on public.journals
  for each row execute function public.guard_delete_journal();

-- ---------------------------------------------------------------------------
-- 2. payroll_periods: block DELETE when finalized/locked (protects runs+records).
-- ---------------------------------------------------------------------------
create or replace function public.guard_delete_payroll_period()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status in ('finalized','locked') then
    raise exception 'Cannot delete % payroll period %', old.status, old.id;
  end if;
  return old;
end $$;
drop trigger if exists trg_guard_delete_payroll_period on public.payroll_periods;
create trigger trg_guard_delete_payroll_period
  before delete on public.payroll_periods
  for each row execute function public.guard_delete_payroll_period();

-- ---------------------------------------------------------------------------
-- 3. payroll_runs: block DELETE when finalized (protects payslip snapshots).
--    Draft/calculated runs remain deletable so hr_run_payroll() can re-run.
-- ---------------------------------------------------------------------------
create or replace function public.guard_delete_payroll_run()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'finalized' then
    raise exception 'Cannot delete finalized payroll run %', old.id;
  end if;
  return old;
end $$;
drop trigger if exists trg_guard_delete_payroll_run on public.payroll_runs;
create trigger trg_guard_delete_payroll_run
  before delete on public.payroll_runs
  for each row execute function public.guard_delete_payroll_run();

-- ---------------------------------------------------------------------------
-- 4. bank_accounts: block DELETE when it has posted or reconciled transactions
--    (protects the reconciled bank ledger and its posted_* links).
-- ---------------------------------------------------------------------------
create or replace function public.guard_delete_bank_account()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.bank_transactions
    where bank_account_id = old.id
      and (posting_status = 'posted' or reconciliation_status = 'reconciled');
  if n > 0 then
    raise exception 'Cannot delete bank account % — it has % posted/reconciled transactions', old.id, n;
  end if;
  return old;
end $$;
drop trigger if exists trg_guard_delete_bank_account on public.bank_accounts;
create trigger trg_guard_delete_bank_account
  before delete on public.bank_accounts
  for each row execute function public.guard_delete_bank_account();

-- ---------------------------------------------------------------------------
-- 5. invoices: block DELETE when an e-invoice (IRN) has been generated
--    (statutory artifact). Cancellation is the soft path (set_invoice_status).
-- ---------------------------------------------------------------------------
create or replace function public.guard_delete_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.einvoice_records
    where invoice_id = old.id and status in ('generated','submitted');
  if n > 0 then
    raise exception 'Cannot delete invoice % — it has a generated e-invoice (IRN). Cancel it instead', old.id;
  end if;
  return old;
end $$;
drop trigger if exists trg_guard_delete_invoice on public.invoices;
create trigger trg_guard_delete_invoice
  before delete on public.invoices
  for each row execute function public.guard_delete_invoice();

-- ---------------------------------------------------------------------------
-- 6. tools: block DELETE when the tool has any movement history
--    (tool_transactions is the sole source of truth for tool stock).
-- ---------------------------------------------------------------------------
create or replace function public.guard_delete_tool()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.tool_transactions where tool_id = old.id;
  if n > 0 then
    raise exception 'Cannot delete tool % — it has % ledger movements; archive it (status=archived) instead', old.id, n;
  end if;
  return old;
end $$;
drop trigger if exists trg_guard_delete_tool on public.tools;
create trigger trg_guard_delete_tool
  before delete on public.tools
  for each row execute function public.guard_delete_tool();
