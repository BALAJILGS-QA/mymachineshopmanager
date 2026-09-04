-- ============================================================================
-- Integrity guards: GL balance, journal-line sidedness, bank direction,
-- non-negative money, journal-number uniqueness.
-- ============================================================================
-- SAFE-BY-CONSTRUCTION. Every new constraint is preceded by a PRE-CHECK that
-- RAISES EXCEPTION (aborting the whole migration transaction) if any existing
-- production row would violate it. Nothing is deleted or rewritten; if the
-- migration aborts, the data is untouched and the offending rows are reported
-- so they can be corrected before re-applying.
--
-- Addresses audit findings C2, H2(partial), M2, M3, M4.
-- (See docs/DATABASE_AUDIT_REPORT.md §5, §8.)
-- Idempotent: guarded with "if not exists" / catalog checks.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. journal_lines: a line may not carry BOTH a debit and a credit. (C2)
-- ---------------------------------------------------------------------------
do $$
declare bad int;
begin
  select count(*) into bad from public.journal_lines where debit > 0 and credit > 0;
  if bad > 0 then
    raise exception 'ABORT: % journal_lines have both debit>0 and credit>0; fix these before applying 0040', bad;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'journal_lines_one_side_chk'
      and conrelid = 'public.journal_lines'::regclass
  ) then
    alter table public.journal_lines
      add constraint journal_lines_one_side_chk check (debit = 0 or credit = 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. GL balance backstop: a POSTED journal must have sum(debit)=sum(credit). (C2)
--    Enforced by a DEFERRABLE INITIALLY DEFERRED constraint trigger, so it is
--    checked once at COMMIT — post_journal() inserts header + all lines in one
--    transaction and passes; drafts (status<>'posted') are exempt while editing.
--    Existing rows are not re-validated by a trigger, so this cannot corrupt or
--    reject already-stored history — but we still report any current imbalance.
-- ---------------------------------------------------------------------------
do $$
declare bad int;
begin
  select count(*) into bad from (
    select j.id from public.journals j
      join public.journal_lines l on l.journal_id = j.id
     where j.status = 'posted'
     group by j.id
     having coalesce(sum(l.debit),0) <> coalesce(sum(l.credit),0)
  ) x;
  if bad > 0 then
    raise warning 'NOTE: % existing POSTED journals are unbalanced (pre-existing). The trigger will enforce balance on NEW/edited journals only; correct historical ones via void_journal + repost.', bad;
  end if;
end $$;

create or replace function public.assert_journal_balanced()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_journal text; v_status text; v_deb numeric; v_cred numeric;
begin
  v_journal := coalesce(new.journal_id, old.journal_id);
  select status into v_status from public.journals where id = v_journal;
  if v_status is null or v_status <> 'posted' then
    return null;                       -- journal gone or not posted → no constraint
  end if;
  select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_deb, v_cred
    from public.journal_lines where journal_id = v_journal;
  if v_deb <> v_cred then
    raise exception 'Journal % is unbalanced: debit % <> credit %', v_journal, v_deb, v_cred;
  end if;
  return null;
end $$;

drop trigger if exists trg_journal_lines_balanced on public.journal_lines;
create constraint trigger trg_journal_lines_balanced
  after insert or update or delete on public.journal_lines
  deferrable initially deferred
  for each row execute function public.assert_journal_balanced();

-- Also re-check when a journal flips to 'posted' (lines may pre-exist as draft).
create or replace function public.assert_journal_balanced_on_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_deb numeric; v_cred numeric;
begin
  if new.status = 'posted' and (tg_op = 'INSERT' or old.status is distinct from 'posted') then
    select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_deb, v_cred
      from public.journal_lines where journal_id = new.id;
    if v_deb <> v_cred then
      raise exception 'Journal % cannot be posted: debit % <> credit %', new.id, v_deb, v_cred;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_journals_balanced_on_post on public.journals;
create constraint trigger trg_journals_balanced_on_post
  after insert or update on public.journals
  deferrable initially deferred
  for each row execute function public.assert_journal_balanced_on_post();

-- ---------------------------------------------------------------------------
-- 3. bank_transactions: a row may not be both a debit and a credit. (M4)
-- ---------------------------------------------------------------------------
do $$
declare bad int;
begin
  select count(*) into bad from public.bank_transactions
    where coalesce(debit_amount,0) > 0 and coalesce(credit_amount,0) > 0;
  if bad > 0 then
    raise exception 'ABORT: % bank_transactions have both debit and credit > 0; fix before applying 0040', bad;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'bank_txn_one_direction_chk'
      and conrelid = 'public.bank_transactions'::regclass
  ) then
    alter table public.bank_transactions
      add constraint bank_txn_one_direction_chk
      check (not (coalesce(debit_amount,0) > 0 and coalesce(credit_amount,0) > 0));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Non-negative money on payroll / advances / claims / salary. (M2)
--    Each guarded by a pre-check; abort (with the offending count) rather than
--    silently letting a bad constraint fail mid-apply.
-- ---------------------------------------------------------------------------
do $$
declare bad int;
begin
  -- payroll_records
  select count(*) into bad from public.payroll_records where gross < 0 or net < 0 or total_deductions < 0;
  if bad > 0 then raise exception 'ABORT: % payroll_records have negative money', bad; end if;
  select count(*) into bad from public.payroll_runs where gross_total < 0 or deduction_total < 0 or net_total < 0;
  if bad > 0 then raise exception 'ABORT: % payroll_runs have negative totals', bad; end if;
  select count(*) into bad from public.employee_advances where amount < 0 or coalesce(outstanding,0) < 0;
  if bad > 0 then raise exception 'ABORT: % employee_advances have negative money', bad; end if;
  select count(*) into bad from public.advance_repayments where amount < 0;
  if bad > 0 then raise exception 'ABORT: % advance_repayments have negative amount', bad; end if;
  select count(*) into bad from public.expense_claims where amount < 0;
  if bad > 0 then raise exception 'ABORT: % expense_claims have negative amount', bad; end if;
  select count(*) into bad from public.salary_structure_lines where amount < 0;
  if bad > 0 then raise exception 'ABORT: % salary_structure_lines have negative amount', bad; end if;
  select count(*) into bad from public.employee_salary where coalesce(ctc,0) < 0;
  if bad > 0 then raise exception 'ABORT: % employee_salary have negative ctc', bad; end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='payroll_records_money_nonneg' and conrelid='public.payroll_records'::regclass) then
    alter table public.payroll_records add constraint payroll_records_money_nonneg
      check (gross >= 0 and net >= 0 and total_deductions >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='payroll_runs_money_nonneg' and conrelid='public.payroll_runs'::regclass) then
    alter table public.payroll_runs add constraint payroll_runs_money_nonneg
      check (gross_total >= 0 and deduction_total >= 0 and net_total >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='employee_advances_money_nonneg' and conrelid='public.employee_advances'::regclass) then
    alter table public.employee_advances add constraint employee_advances_money_nonneg
      check (amount >= 0 and coalesce(outstanding,0) >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='advance_repayments_amount_nonneg' and conrelid='public.advance_repayments'::regclass) then
    alter table public.advance_repayments add constraint advance_repayments_amount_nonneg check (amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='expense_claims_amount_nonneg' and conrelid='public.expense_claims'::regclass) then
    alter table public.expense_claims add constraint expense_claims_amount_nonneg check (amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='salary_lines_amount_nonneg' and conrelid='public.salary_structure_lines'::regclass) then
    alter table public.salary_structure_lines add constraint salary_lines_amount_nonneg check (amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='employee_salary_ctc_nonneg' and conrelid='public.employee_salary'::regclass) then
    alter table public.employee_salary add constraint employee_salary_ctc_nonneg check (coalesce(ctc,0) >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. journals.journal_no: backfill nulls + enforce uniqueness. (M3)
--    Uniqueness is GLOBAL here; migration 0044 re-scopes it to (tenant_id,
--    journal_no) as part of the multi-tenant rollout.
-- ---------------------------------------------------------------------------
do $$
declare dup int;
begin
  -- backfill any null journal_no deterministically from the id
  update public.journals set journal_no = 'JV-' || id where journal_no is null;
  -- pre-check for existing duplicates
  select count(*) into dup from (
    select journal_no from public.journals group by journal_no having count(*) > 1
  ) d;
  if dup > 0 then
    raise exception 'ABORT: % duplicate journal_no values exist; resolve before applying 0040', dup;
  end if;
  if not exists (select 1 from pg_class where relname = 'uq_journals_journal_no') then
    create unique index uq_journals_journal_no on public.journals (journal_no);
  end if;
end $$;
