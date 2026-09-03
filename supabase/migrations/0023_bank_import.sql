-- ============================================================================
-- Bank statement import pipeline: uploaded files (hash de-dup), the canonical
-- bank-transaction model, the classification rule engine, party aliases, and
-- the atomic RPC that turns a reviewed transaction into a Payment/Receipt/Expense
-- + a balanced journal entry, then marks it reconciled.
-- ============================================================================
-- Design notes
--  • Builds on 0022 (post_journal, acc_system) and reuses EXISTING money tables:
--    a bank CREDIT (money in) posts to `payments` (customer receipts), a bank
--    DEBIT (money out) posts to `expenses`. Two safe additive columns
--    (source, bank_txn_id) give traceability without new payment/expense tables.
--  • Nothing here recomputes invoice balances by hand — when a receipt is
--    allocated to an invoice it uses the same status recompute as create_payment.
--  • De-dup uses a client-computed `dedupe_hash` plus multi-signal checks.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Additive traceability columns on existing money tables (safe / non-breaking)
-- ---------------------------------------------------------------------------
alter table public.payments  add column if not exists source text not null default 'manual';
alter table public.payments  add column if not exists bank_txn_id text;
alter table public.expenses  add column if not exists source text not null default 'manual';
alter table public.expenses  add column if not exists bank_txn_id text;

-- ---------------------------------------------------------------------------
-- 2. Uploaded statement files (hash de-dup)
-- ---------------------------------------------------------------------------
create table if not exists public.bank_statement_files (
  id              text primary key,
  company_id      text references public.companies(id),
  bank_account_id text references public.bank_accounts(id),
  file_name       text not null,
  file_hash       text not null,                 -- sha-256 hex of raw bytes
  file_size       int,
  parser_type     text,                          -- csv|xlsx|pdf
  row_count       int not null default 0,
  status          text not null default 'uploaded'
                  check (status in ('uploaded','parsed','reviewed','posted','partial')),
  meta            jsonb not null default '{}'::jsonb,
  imported_by     text,
  imported_at     timestamptz not null default now()
);
create index if not exists idx_bsf_hash on public.bank_statement_files (file_hash);
create index if not exists idx_bsf_bank on public.bank_statement_files (bank_account_id);

-- ---------------------------------------------------------------------------
-- 3. Canonical bank transaction model
-- ---------------------------------------------------------------------------
create table if not exists public.bank_transactions (
  id                    text primary key,
  bank_account_id       text not null references public.bank_accounts(id) on delete cascade,
  statement_file_id     text references public.bank_statement_files(id) on delete set null,
  company_id            text references public.companies(id),
  transaction_date      date not null,
  value_date            date,
  narration             text,
  reference_number      text,
  cheque_number         text,
  debit_amount          numeric not null default 0,   -- money out
  credit_amount         numeric not null default 0,   -- money in
  balance_after         numeric,
  currency              text not null default 'INR',
  source_row_number     int,
  parser_type           text,
  parser_confidence     numeric,                       -- 0..100 (parse quality)
  -- classification / matching
  classification        text,                          -- customer_receipt|vendor_payment|bank_charges|salary|gst_payment|loan_emi|other|unknown
  matched_party_type    text,                          -- customer|vendor|employee|other
  matched_party_id      text,
  matched_invoice_id    text references public.invoices(id),
  matched_ledger_account_id text references public.chart_of_accounts(id),
  confidence            numeric not null default 0,     -- 0..100 (classification confidence)
  -- lifecycle
  dedupe_hash           text,
  dup_status            text not null default 'new'
                        check (dup_status in ('new','possible_duplicate','duplicate','ignored')),
  review_status         text not null default 'pending'
                        check (review_status in ('pending','approved','ignored')),
  reconciliation_status text not null default 'unreconciled'
                        check (reconciliation_status in ('unreconciled','reconciled')),
  posting_status        text not null default 'unposted'
                        check (posting_status in ('unposted','posted')),
  posted_payment_id     text,
  posted_expense_id     text,
  posted_journal_id     text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_btx_account on public.bank_transactions (bank_account_id);
create index if not exists idx_btx_file on public.bank_transactions (statement_file_id);
create index if not exists idx_btx_date on public.bank_transactions (transaction_date);
create index if not exists idx_btx_dedupe on public.bank_transactions (dedupe_hash);
create index if not exists idx_btx_status on public.bank_transactions (posting_status, reconciliation_status);

-- ---------------------------------------------------------------------------
-- 4. Classification rule engine
-- ---------------------------------------------------------------------------
create table if not exists public.bank_txn_rules (
  id                text primary key,
  company_id        text references public.companies(id),
  name              text not null,
  priority          int not null default 100,      -- lower runs first
  match_field       text not null default 'narration' check (match_field in ('narration','reference')),
  match_op          text not null default 'contains' check (match_op in ('contains','equals','starts_with','regex')),
  match_value       text not null,
  direction         text not null default 'any' check (direction in ('debit','credit','any')),
  classification    text,
  party_type        text,
  party_id          text,
  ledger_account_id text references public.chart_of_accounts(id),
  confidence        numeric not null default 90,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_btr_priority on public.bank_txn_rules (priority);

-- ---------------------------------------------------------------------------
-- 5. Party aliases (bank narrations rarely match the legal name exactly)
-- ---------------------------------------------------------------------------
create table if not exists public.party_aliases (
  id         text primary key,
  company_id text references public.companies(id),
  party_type text not null check (party_type in ('customer','vendor')),
  party_id   text not null,
  alias      text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_alias_party on public.party_aliases (party_type, party_id);
create index if not exists idx_alias_text on public.party_aliases (lower(alias));

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
do $$
declare spec record;
begin
  for spec in
    select * from (values
      ('bank_statement_files', 'ACCOUNTS_VIEW', 'BANK_IMPORT'),
      ('bank_transactions',    'ACCOUNTS_VIEW', 'BANK_IMPORT'),
      ('bank_txn_rules',       'ACCOUNTS_VIEW', 'BANK_IMPORT'),
      ('party_aliases',        'ACCOUNTS_VIEW', 'BANK_IMPORT')
    ) as t(tbl, read_perm, write_perm)
  loop
    execute format('alter table public.%I enable row level security;', spec.tbl);
    execute format('drop policy if exists p_read on public.%I;', spec.tbl);
    execute format($f$create policy p_read on public.%I for select to authenticated
      using (public.is_app_approved() and (public.hr_has_permission(%L) or public.is_hr_admin()));$f$,
      spec.tbl, spec.read_perm);
    execute format('drop policy if exists p_write on public.%I;', spec.tbl);
    execute format($f$create policy p_write on public.%I for all to authenticated
      using (public.hr_has_permission(%L) or public.is_hr_admin())
      with check (public.hr_has_permission(%L) or public.is_hr_admin());$f$,
      spec.tbl, spec.write_perm, spec.write_perm);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Duplicate detection — flag transactions in a file that match an already
--    posted/imported transaction elsewhere (same account+date+amount+dir, and
--    matching ref/cheque or dedupe_hash). Non-destructive: only sets dup_status.
-- ---------------------------------------------------------------------------
create or replace function public.detect_bank_duplicates(p_file_id text)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  if not (public.hr_has_permission('BANK_IMPORT') or public.is_hr_admin()) then
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
end $$;

-- ---------------------------------------------------------------------------
-- 8. post_bank_txn — the reviewed → posted step. Creates the matching money
--    record (payment for credits, expense for debits) + a balanced journal,
--    links everything back to the bank transaction, marks it reconciled.
--    Optional overrides let the review UI correct the auto-classification.
-- ---------------------------------------------------------------------------
create or replace function public.post_bank_txn(
  p_txn_id text,
  p_ledger_account_id text default null,   -- counter account override
  p_party_type text default null,
  p_party_id text default null,
  p_invoice_id text default null,
  p_category text default null             -- expense category label override
) returns jsonb language plpgsql security definer set search_path = public as $$
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
  if not (public.hr_has_permission('BANK_IMPORT') or public.is_hr_admin()) then
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
end $$;

grant execute on function public.detect_bank_duplicates(text) to authenticated;
grant execute on function public.post_bank_txn(text, text, text, text, text, text) to authenticated;
