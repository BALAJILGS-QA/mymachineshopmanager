-- ============================================================================
-- 0030: Bank-statement import — make posting actually work end-to-end.
-- ============================================================================
-- Three real defects prevented reviewed bank transactions from posting into the
-- Payments / Expenses modules (found by cross-checking post_bank_txn against the
-- base schema in docs/supabase-schema.sql):
--
--  1. invoice_totals key column is `invoice_id` (view: `i.id as invoice_id`), but
--     post_bank_txn queried `invoice_totals where id = i.id` → "column id does not
--     exist" → EVERY credit allocated to an invoice crashed (the best-case path).
--
--  2. payments.company_id is NOT NULL references companies(id). Unmatched credits
--     fell back to the bank account's company_id, which is normally NULL → NOT
--     NULL violation → most receipts could not post at all.
--
--  3. post_bank_txn_split had the same NULL company_id risk on credit splits.
--
-- This migration:
--  • adds acc_unallocated_customer() — a system "Unallocated Bank Receipts"
--    customer so an unmatched credit ALWAYS has a valid home (re-assign later);
--  • re-emits post_bank_txn / post_bank_txn_split with the invoice_totals fix and
--    the never-null company resolution;
--  • adds post_bank_file() — posts every eligible transaction in one file in a
--    single call, continue-on-error, so "upload → everything mapped" works and
--    NO record is silently skipped.
-- Additive + idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. System "Unallocated Bank Receipts" customer for unmatched credits.
--    Payments require a customer (companies row); this guarantees one exists so
--    nothing is skipped. Receipts landing here are advances the user can later
--    re-assign to the real customer from the Payments module.
-- ---------------------------------------------------------------------------
create or replace function public.acc_unallocated_customer()
returns text language plpgsql security definer set search_path = public as $$
declare v_id text := 'sys_unallocated_receipts';
begin
  insert into public.companies (id, code, name, active, notes)
  values (v_id, 'SYS-UNALLOC', 'Unallocated Bank Receipts', true,
          'System party for bank receipts that could not be matched to a customer. Re-assign to the real customer once identified.')
  on conflict (id) do nothing;
  return v_id;
end $$;
grant execute on function public.acc_unallocated_customer() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. post_bank_txn — re-emitted with the two credit-side fixes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_bank_txn(p_txn_id text, p_ledger_account_id text DEFAULT NULL::text, p_party_type text DEFAULT NULL::text, p_party_id text DEFAULT NULL::text, p_invoice_id text DEFAULT NULL::text, p_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t record;
  v_bank record;
  v_bank_acc text;                          -- GL bank account id
  v_counter text;                           -- GL counter account id
  v_amount numeric;
  v_is_credit boolean;
  v_company text;                           -- accounting/company scope for the journal
  v_pay_company text;                       -- customer the receipt belongs to (never null)
  v_invoice text;                           -- resolved invoice id (nullable)
  v_email text := public.hr_current_email();
  v_pay_id text;
  v_exp_id text;
  v_jr_id text;
  v_no text;
  v_lines jsonb;
  v_party_name text;
  v_category text;
begin
  if not (public.is_app_approved()) then
    raise exception 'Not authorized to post bank transactions';
  end if;
  select * into v_t from public.bank_transactions where id = p_txn_id for update;
  if v_t is null then raise exception 'Unknown bank transaction'; end if;
  if v_t.posting_status = 'posted' then raise exception 'Transaction already posted'; end if;
  if v_t.dup_status = 'duplicate' then raise exception 'Transaction is marked as a duplicate'; end if;

  select * into v_bank from public.bank_accounts where id = v_t.bank_account_id;
  v_company := coalesce(v_t.company_id, v_bank.company_id);
  v_is_credit := coalesce(v_t.credit_amount,0) > 0;
  v_amount := case when v_is_credit then v_t.credit_amount else v_t.debit_amount end;
  if v_amount <= 0 then raise exception 'Transaction has no amount'; end if;

  -- GL bank account: the bank account's own ledger link, else the 'bank' system account.
  v_bank_acc := coalesce(v_bank.ledger_account_id, public.acc_system('bank', v_company));
  if v_bank_acc is null then raise exception 'No bank ledger account configured'; end if;

  -- Counter account: explicit override → txn match → sensible default by direction.
  v_counter := coalesce(
    p_ledger_account_id,
    v_t.matched_ledger_account_id,
    case when v_is_credit then public.acc_system('ar', v_company)
         else public.acc_system('other_expense', v_company) end
  );
  if v_counter is null then raise exception 'No counter ledger account resolved'; end if;

  if v_is_credit then
    -- Money IN → Receipt in the payments table.
    -- The receipt's customer is: explicit override → matched customer →
    -- system "Unallocated Bank Receipts" customer (payments.company_id is NOT
    -- NULL, so we must never insert a null — this guarantees no credit is skipped).
    v_pay_company := coalesce(p_party_id, v_t.matched_party_id, public.acc_unallocated_customer());
    v_invoice := coalesce(p_invoice_id, v_t.matched_invoice_id);
    begin v_no := 'RCP-' || lpad(public.next_seq('payment')::text, 5, '0');
    exception when others then v_no := 'RCP-' || substr(p_txn_id, 1, 6); end;
    v_pay_id := 'pay_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
    insert into public.payments
      (id, payment_no, date, company_id, invoice_id, amount, method, reference,
       is_advance, notes, source, bank_txn_id)
    values
      (v_pay_id, v_no, v_t.transaction_date, v_pay_company, v_invoice, v_amount,
       'Bank Transfer', coalesce(v_t.reference_number, v_t.cheque_number),
       (v_invoice is null),
       'Imported from bank statement', 'bank_import', v_t.id);
    -- If allocated to an invoice, recompute its status (invoice_totals keys on invoice_id).
    if v_invoice is not null then
      update public.invoices i set status = (
        case when (select coalesce(sum(amount),0) from public.payments where invoice_id = i.id) <= 0
               then 'Unpaid'
             when (select coalesce(sum(amount),0) from public.payments where invoice_id = i.id)
                  >= (select total from public.invoice_totals where invoice_id = i.id)
               then 'Paid'
             else 'Partially Paid' end)::invoice_status,
          updated_at = now()
        where i.id = v_invoice
          and i.status not in ('Draft','Cancelled');
    end if;
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_bank_acc, 'debit', v_amount, 'credit', 0, 'description', v_t.narration),
      jsonb_build_object('account_id', v_counter, 'debit', 0, 'credit', v_amount, 'description', v_t.narration,
                         'party_type', coalesce(p_party_type, v_t.matched_party_type), 'party_id', coalesce(p_party_id, v_t.matched_party_id))
    );
  else
    -- Money OUT → Expense row (vendor payment / bank charges / salary / gst …).
    select name into v_party_name from public.vendors where id = coalesce(p_party_id, v_t.matched_party_id);
    v_category := coalesce(p_category, initcap(replace(coalesce(v_t.classification,'other'), '_', ' ')));
    begin v_no := 'EXP-' || lpad(public.next_seq('expense')::text, 5, '0');
    exception when others then v_no := 'EXP-' || substr(p_txn_id, 1, 6); end;
    v_exp_id := 'exp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
    insert into public.expenses
      (id, expense_no, date, category, amount, method, vendor, reference, company_id, notes,
       source, bank_txn_id)
    values
      (v_exp_id, v_no, v_t.transaction_date, v_category, v_amount, 'Bank Transfer',
       coalesce(v_party_name, ''), coalesce(v_t.reference_number, v_t.cheque_number),
       nullif(v_company,''), 'Imported from bank statement', 'bank_import', v_t.id);
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_counter, 'debit', v_amount, 'credit', 0, 'description', v_t.narration,
                         'party_type', coalesce(p_party_type, v_t.matched_party_type), 'party_id', coalesce(p_party_id, v_t.matched_party_id)),
      jsonb_build_object('account_id', v_bank_acc, 'debit', 0, 'credit', v_amount, 'description', v_t.narration)
    );
  end if;

  -- Balanced journal for the double-entry books.
  v_jr_id := public.post_journal(v_company, v_t.transaction_date,
    coalesce(v_t.narration, 'Bank transaction'), v_lines,
    'bank_import', 'bank_transaction', v_t.id, 'posted');

  update public.bank_transactions
    set posting_status = 'posted', reconciliation_status = 'reconciled', review_status = 'approved',
        posted_payment_id = v_pay_id, posted_expense_id = v_exp_id, posted_journal_id = v_jr_id,
        updated_at = now()
    where id = p_txn_id;

  perform public.hr_log('post', 'bank_transaction', p_txn_id,
    'Posted bank transaction (' || v_amount || ')', null,
    jsonb_build_object('payment_id', v_pay_id, 'expense_id', v_exp_id, 'journal_id', v_jr_id), v_company);

  return jsonb_build_object('payment_id', v_pay_id, 'expense_id', v_exp_id, 'journal_id', v_jr_id);
end $function$
;

-- ---------------------------------------------------------------------------
-- 2. post_bank_txn_split — re-emitted; credit splits get the same never-null
--    customer fallback so an unmatched credit split still lands in Payments.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_bank_txn_split(p_txn_id text, p_splits jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t record;
  v_bank record;
  v_bank_acc text;
  v_company text;
  v_is_credit boolean;
  v_amount numeric;
  v_split_total numeric := 0;
  v_split jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_jr_id text;
  v_no text;
  v_n int := 0;
  v_party_name text;
begin
  if not (public.is_app_approved()) then
    raise exception 'Not authorized to post bank transactions';
  end if;
  select * into v_t from public.bank_transactions where id = p_txn_id for update;
  if v_t is null then raise exception 'Unknown bank transaction'; end if;
  if v_t.posting_status = 'posted' then raise exception 'Transaction already posted'; end if;
  if p_splits is null or jsonb_array_length(p_splits) < 1 then
    raise exception 'At least one split line is required';
  end if;

  select * into v_bank from public.bank_accounts where id = v_t.bank_account_id;
  v_company := coalesce(v_t.company_id, v_bank.company_id);
  v_is_credit := coalesce(v_t.credit_amount, 0) > 0;
  v_amount := case when v_is_credit then v_t.credit_amount else v_t.debit_amount end;
  v_bank_acc := coalesce(v_bank.ledger_account_id, public.acc_system('bank', v_company));
  if v_bank_acc is null then raise exception 'No bank ledger account configured'; end if;

  -- Validate the split total equals the bank amount to the paisa.
  for v_split in select * from jsonb_array_elements(p_splits) loop
    v_split_total := v_split_total + coalesce((v_split->>'amount')::numeric, 0);
  end loop;
  if round(v_split_total, 2) <> round(v_amount, 2) then
    raise exception 'Split total (%) must equal the transaction amount (%)', v_split_total, v_amount;
  end if;

  -- Bank leg (single) + one counter leg per split.
  if v_is_credit then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_bank_acc, 'debit', v_amount, 'credit', 0, 'description', v_t.narration));
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_bank_acc, 'debit', 0, 'credit', v_amount, 'description', v_t.narration));
  end if;

  for v_split in select * from jsonb_array_elements(p_splits) loop
    v_n := v_n + 1;
    if v_is_credit then
      v_lines := v_lines || jsonb_build_object(
        'account_id', v_split->>'ledger_account_id', 'debit', 0,
        'credit', (v_split->>'amount')::numeric, 'description', v_split->>'description',
        'party_type', v_split->>'party_type', 'party_id', v_split->>'party_id');
      -- Receipt row per credit split (never-null customer).
      begin v_no := 'RCP-' || lpad(public.next_seq('payment')::text, 5, '0');
      exception when others then v_no := 'RCP-' || substr(p_txn_id,1,6) || v_n; end;
      insert into public.payments
        (id, payment_no, date, company_id, invoice_id, amount, method, reference, is_advance, notes, source, bank_txn_id)
      values ('pay_' || substr(md5(random()::text||clock_timestamp()::text||v_n::text),1,16), v_no,
        v_t.transaction_date, coalesce(nullif(v_split->>'party_id',''), public.acc_unallocated_customer()), null,
        (v_split->>'amount')::numeric, 'Bank Transfer', v_t.reference_number, true,
        'Bank statement split', 'bank_import', v_t.id);
    else
      v_lines := v_lines || jsonb_build_object(
        'account_id', v_split->>'ledger_account_id', 'debit', (v_split->>'amount')::numeric,
        'credit', 0, 'description', v_split->>'description',
        'party_type', v_split->>'party_type', 'party_id', v_split->>'party_id');
      -- Expense row per debit split.
      select name into v_party_name from public.vendors where id = v_split->>'party_id';
      begin v_no := 'EXP-' || lpad(public.next_seq('expense')::text, 5, '0');
      exception when others then v_no := 'EXP-' || substr(p_txn_id,1,6) || v_n; end;
      insert into public.expenses
        (id, expense_no, date, category, amount, method, vendor, reference, company_id, notes, source, bank_txn_id)
      values ('exp_' || substr(md5(random()::text||clock_timestamp()::text||v_n::text),1,16), v_no,
        v_t.transaction_date,
        coalesce(v_split->>'category', 'Split'), (v_split->>'amount')::numeric, 'Bank Transfer',
        coalesce(v_party_name, ''), v_t.reference_number, nullif(v_company,''),
        'Bank statement split', 'bank_import', v_t.id);
    end if;
  end loop;

  v_jr_id := public.post_journal(v_company, v_t.transaction_date,
    coalesce(v_t.narration, 'Bank transaction (split)'), v_lines,
    'bank_import', 'bank_transaction', v_t.id, 'posted');

  update public.bank_transactions
    set posting_status = 'posted', reconciliation_status = 'reconciled', review_status = 'approved',
        posted_journal_id = v_jr_id, notes = coalesce(notes,'') || ' [split x' || v_n || ']', updated_at = now()
    where id = p_txn_id;

  perform public.hr_log('post', 'bank_transaction', p_txn_id,
    'Posted split bank transaction (' || v_amount || ', ' || v_n || ' splits)', null,
    jsonb_build_object('journal_id', v_jr_id, 'splits', v_n), v_company);

  return jsonb_build_object('journal_id', v_jr_id, 'splits', v_n);
end $function$
;

-- ---------------------------------------------------------------------------
-- 3. post_bank_file — post EVERY eligible transaction in a file in one call.
--    Powers the "upload → automatically map everything" flow. Continue-on-error
--    so one bad row never blocks the rest; confirmed duplicates and rows the user
--    ignored are the ONLY things skipped, and those counts are returned so the
--    caller can show exactly what happened (nothing silently dropped).
-- ---------------------------------------------------------------------------
create or replace function public.post_bank_file(p_file_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_posted int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not (public.is_app_approved()) then
    raise exception 'Not authorized to post bank transactions';
  end if;

  for v_row in
    select id, dup_status, review_status, posting_status,
           coalesce(debit_amount,0) as d, coalesce(credit_amount,0) as c
    from public.bank_transactions
    where statement_file_id = p_file_id
    order by transaction_date, source_row_number
  loop
    -- Skip only what must be skipped: already posted, confirmed duplicate, or
    -- explicitly ignored, or a zero-amount (non-money) row.
    if v_row.posting_status = 'posted'
       or v_row.dup_status = 'duplicate'
       or v_row.review_status = 'ignored'
       or (v_row.d = 0 and v_row.c = 0) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    begin
      perform public.post_bank_txn(v_row.id);
      v_posted := v_posted + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('txn_id', v_row.id, 'error', SQLERRM);
    end;
  end loop;

  -- Reflect overall progress on the file.
  update public.bank_statement_files
    set status = case when v_failed = 0 and v_posted > 0 then 'posted'
                      when v_posted > 0 then 'partial'
                      else status end
    where id = p_file_id;

  return jsonb_build_object('posted', v_posted, 'failed', v_failed, 'skipped', v_skipped, 'errors', v_errors);
end $$;
grant execute on function public.post_bank_file(text) to authenticated;
