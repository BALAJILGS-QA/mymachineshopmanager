-- ============================================================================
-- 0026: Align Accounts & Finance authorization with the app's baseline.
-- ============================================================================
-- Why: the existing ERP protects every table with a single policy — any
-- is_app_approved() user reads+writes (companies/payments/invoices all do this).
-- Migrations 0022-0025 gated finance on HR permissions that no one has been
-- assigned (hr_user_roles is empty), which locked approved users out of the
-- whole module (e.g. "unable to add a bank account"). This restores parity:
-- finance behaves like the rest of the ERP. The RBAC layer stays available —
-- once real roles are assigned an org can tighten these back — but the default
-- is usable. Additive + idempotent.
-- ============================================================================

-- 1. Table RLS → is_app_approved() (read + write), like companies.
do $$
declare t text;
begin
  foreach t in array array['chart_of_accounts','fiscal_years','accounting_periods','journals','journal_lines','bank_accounts','bank_statement_files','bank_transactions','bank_txn_rules','party_aliases','gst_registrations','gst_tax_rates','hsn_codes','gst_return_periods','einvoice_records','eway_bills']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists p_read on public.%I;', t);
    execute format('drop policy if exists p_write on public.%I;', t);
    execute format('drop policy if exists approved_all on public.%I;', t);
    execute format($f$create policy approved_all on public.%I for all to authenticated
      using (public.is_app_approved()) with check (public.is_app_approved());$f$, t);
  end loop;
end $$;

-- 2. RPC guards → is_app_approved() (re-emitted verbatim with the guard relaxed).
-- post_journal
CREATE OR REPLACE FUNCTION public.post_journal(p_company_id text, p_date date, p_narration text, p_lines jsonb, p_source text DEFAULT 'manual'::text, p_source_type text DEFAULT NULL::text, p_source_id text DEFAULT NULL::text, p_status text DEFAULT 'posted'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id text;
  v_no text;
  v_period text;
  v_period_status text;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line jsonb;
  v_n int := 0;
  v_email text := public.hr_current_email();
begin
  if not (public.is_app_approved()) then
    raise exception 'Not authorized to post journal entries';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal needs at least two lines';
  end if;

  -- Period lock guard.
  v_period := public.acc_period_for(p_date, p_company_id);
  if v_period is not null then
    select status into v_period_status from public.accounting_periods where id = v_period;
    if v_period_status = 'locked' then
      raise exception 'Accounting period is locked for %', p_date;
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_total_debit  := v_total_debit  + coalesce((v_line->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((v_line->>'credit')::numeric, 0);
  end loop;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'Journal is not balanced (debit % <> credit %)', v_total_debit, v_total_credit;
  end if;
  if round(v_total_debit, 2) <= 0 then
    raise exception 'Journal total must be greater than zero';
  end if;

  v_id := 'jr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
  begin
    v_no := 'JV-' || lpad(public.next_seq('journal')::text, 5, '0');
  exception when others then
    v_no := 'JV-' || substr(v_id, 4, 6);
  end;

  insert into public.journals
    (id, company_id, journal_no, date, period_id, narration, source, source_type, source_id,
     status, created_by, posted_by, posted_at)
  values
    (v_id, p_company_id, v_no, p_date, v_period, p_narration, p_source, p_source_type, p_source_id,
     coalesce(p_status,'posted'), v_email,
     case when coalesce(p_status,'posted') = 'posted' then v_email end,
     case when coalesce(p_status,'posted') = 'posted' then now() end);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    insert into public.journal_lines
      (id, journal_id, account_id, debit, credit, description, party_type, party_id, line_no)
    values
      ('jl_' || substr(md5(random()::text || clock_timestamp()::text || v_n::text), 1, 16),
       v_id, v_line->>'account_id',
       coalesce((v_line->>'debit')::numeric, 0), coalesce((v_line->>'credit')::numeric, 0),
       v_line->>'description', v_line->>'party_type', v_line->>'party_id', v_n);
  end loop;

  perform public.hr_log('post', 'journal', v_id,
    'Journal ' || v_no || ' (' || round(v_total_debit,2) || ')', null,
    jsonb_build_object('amount', v_total_debit, 'source', p_source), p_company_id);
  return v_id;
end $function$
;

-- void_journal
CREATE OR REPLACE FUNCTION public.void_journal(p_id text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_j record; v_period_status text;
begin
  if not (public.is_app_approved()) then
    raise exception 'Not authorized to void journals';
  end if;
  select * into v_j from public.journals where id = p_id for update;
  if v_j is null then raise exception 'Unknown journal'; end if;
  if v_j.period_id is not null then
    select status into v_period_status from public.accounting_periods where id = v_j.period_id;
    if v_period_status = 'locked' then raise exception 'Period is locked'; end if;
  end if;
  update public.journals set status = 'void', updated_at = now(), narration =
    coalesce(narration,'') || case when p_reason is not null then ' [VOID: '||p_reason||']' else '' end
    where id = p_id;
  perform public.hr_log('void', 'journal', p_id, 'Journal voided', null, null, v_j.company_id);
end $function$
;

-- post_bank_txn
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
  v_company text;
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
    begin v_no := 'RCP-' || lpad(public.next_seq('payment')::text, 5, '0');
    exception when others then v_no := 'RCP-' || substr(p_txn_id, 1, 6); end;
    v_pay_id := 'pay_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
    insert into public.payments
      (id, payment_no, date, company_id, invoice_id, amount, method, reference,
       is_advance, notes, source, bank_txn_id)
    values
      (v_pay_id, v_no, v_t.transaction_date, coalesce(p_party_id, v_t.matched_party_id, v_company),
       coalesce(p_invoice_id, v_t.matched_invoice_id), v_amount, 'Bank Transfer',
       coalesce(v_t.reference_number, v_t.cheque_number),
       (coalesce(p_invoice_id, v_t.matched_invoice_id) is null),
       'Imported from bank statement', 'bank_import', v_t.id);
    -- If allocated to an invoice, recompute its status like create_payment does.
    if coalesce(p_invoice_id, v_t.matched_invoice_id) is not null then
      update public.invoices i set status = (
        case when (select coalesce(sum(amount),0) from public.payments where invoice_id = i.id) <= 0
               then 'Unpaid'
             when (select coalesce(sum(amount),0) from public.payments where invoice_id = i.id)
                  >= (select total from public.invoice_totals where id = i.id)
               then 'Paid'
             else 'Partially Paid' end)::invoice_status,
          updated_at = now()
        where i.id = coalesce(p_invoice_id, v_t.matched_invoice_id)
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

-- post_bank_txn_split
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
      -- Receipt row per credit split.
      begin v_no := 'RCP-' || lpad(public.next_seq('payment')::text, 5, '0');
      exception when others then v_no := 'RCP-' || substr(p_txn_id,1,6) || v_n; end;
      insert into public.payments
        (id, payment_no, date, company_id, invoice_id, amount, method, reference, is_advance, notes, source, bank_txn_id)
      values ('pay_' || substr(md5(random()::text||clock_timestamp()::text||v_n::text),1,16), v_no,
        v_t.transaction_date, coalesce(v_split->>'party_id', v_company), null,
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

-- detect_bank_duplicates
CREATE OR REPLACE FUNCTION public.detect_bank_duplicates(p_file_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int := 0;
begin
  if not (public.is_app_approved()) then
    raise exception 'Not authorized';
  end if;

  -- Exact duplicates: same dedupe_hash already exists in another (earlier) row.
  update public.bank_transactions t
    set dup_status = 'duplicate', updated_at = now()
  where t.statement_file_id = p_file_id
    and t.dup_status = 'new'
    and exists (
      select 1 from public.bank_transactions o
      where o.id <> t.id
        and o.dedupe_hash is not null
        and o.dedupe_hash = t.dedupe_hash
        and (o.statement_file_id is distinct from t.statement_file_id or o.created_at < t.created_at)
    );
  get diagnostics v_count = row_count;

  -- Possible duplicates: same account/date/amount/direction but not hash-equal.
  update public.bank_transactions t
    set dup_status = 'possible_duplicate', updated_at = now()
  where t.statement_file_id = p_file_id
    and t.dup_status = 'new'
    and exists (
      select 1 from public.bank_transactions o
      where o.id <> t.id
        and o.bank_account_id = t.bank_account_id
        and o.transaction_date = t.transaction_date
        and o.debit_amount = t.debit_amount
        and o.credit_amount = t.credit_amount
        and o.statement_file_id is distinct from t.statement_file_id
    );
  return v_count;
end $function$
;
