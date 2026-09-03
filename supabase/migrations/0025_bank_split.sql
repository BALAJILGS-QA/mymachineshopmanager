-- ============================================================================
-- Split a single bank transaction across several postings (§22). One bank
-- transaction (e.g. a ₹1,00,000 debit) → several counter postings (vendor
-- ₹80k + bank charges ₹2k + other ₹18k), as ONE balanced journal plus a
-- payment/expense row per split. The split total MUST equal the bank amount.
-- ============================================================================
-- Builds on 0022 (post_journal/acc_system) + 0023 (bank_transactions, payments/
-- expenses source columns). Additive. Idempotent.
-- ============================================================================

create or replace function public.post_bank_txn_split(
  p_txn_id text,
  p_splits jsonb   -- [{ledger_account_id, amount, party_type, party_id, description, category}]
) returns jsonb language plpgsql security definer set search_path = public as $$
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
  if not (public.hr_has_permission('BANK_IMPORT') or public.is_hr_admin()) then
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
end $$;

grant execute on function public.post_bank_txn_split(text, jsonb) to authenticated;
