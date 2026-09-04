-- ============================================================================
-- Auto-populate expenses.payee from the linked bank-statement narration.
-- ============================================================================
-- Bank-imported expenses carry a bank_txn_id but no payee — the receiver name
-- lives inside the transaction narration, e.g.
--     UPI/509059567019/DR/BALAJI N/UTI /UPI   ->  BALAJI N
--     TO CASH SELF / <ref>-ATM-...            ->  Self
-- This migration adds a DYNAMIC parser (no hardcoded names), a BEFORE INSERT
-- trigger so every future bank-import expense gets its payee, and a one-time
-- backfill for the existing rows. GST / bank-charge narrations carry no person
-- name, so the parser returns NULL and those rows are left blank.
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS + guarded backfill.
-- ============================================================================

-- 1. Dynamic extractor: pull the receiver name out of a bank narration.
create or replace function public.extract_payee_from_narration(p_narration text)
returns text language sql immutable as $$
  select case
    -- UPI: UPI/<ref>/DR|CR/<NAME>/<BANK>/UPI  ->  the 4th "/"-segment.
    when upper(split_part(coalesce(p_narration,''), '/', 1)) = 'UPI'
         and length(trim(split_part(p_narration, '/', 4))) > 0
      then trim(split_part(p_narration, '/', 4))
    -- Self cash withdrawals (ATM / SELF / TO CASH SELF).
    when upper(trim(coalesce(p_narration,''))) in ('SELF', 'TO CASH SELF')
         or upper(coalesce(p_narration,'')) like 'TO CASH%'
         or upper(coalesce(p_narration,'')) like '%-ATM-%'
      then 'Self'
    else null
  end;
$$;

grant execute on function public.extract_payee_from_narration(text) to authenticated;

-- 2. Trigger: fill payee on insert when it's blank and a bank txn is linked.
--    Manual expenses (payee typed in the form, or no bank_txn_id) are untouched.
create or replace function public.expenses_fill_payee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.payee is null or new.payee = '') and new.bank_txn_id is not null then
    select public.extract_payee_from_narration(bt.narration)
      into new.payee
      from public.bank_transactions bt
     where bt.id = new.bank_txn_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_expenses_fill_payee on public.expenses;
create trigger trg_expenses_fill_payee
  before insert on public.expenses
  for each row execute function public.expenses_fill_payee();

-- 3. One-time backfill of existing bank-import expenses.
update public.expenses e
   set payee = public.extract_payee_from_narration(bt.narration),
       updated_at = now()
  from public.bank_transactions bt
 where bt.id = e.bank_txn_id
   and (e.payee is null or e.payee = '')
   and public.extract_payee_from_narration(bt.narration) is not null;
