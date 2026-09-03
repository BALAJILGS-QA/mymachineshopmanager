-- ============================================================================
-- Accounting core: double-entry foundation for the Accounts & Finance module.
-- Chart of accounts, fiscal years/periods, journals + lines (balanced posting),
-- general-ledger / trial-balance views, and company bank accounts.
-- ============================================================================
-- Design notes
--  • Builds on 0019 (RBAC: hr_has_permission / is_hr_admin / is_app_approved /
--    hr_log). Additive + idempotent. Touches NO existing table except two safe
--    additive columns in 0023 (payments/expenses) — none here.
--  • Reuses existing money data: companies (=customers, gstin), vendors, invoices
--    (create_invoice / invoice_totals), payments (create_payment). The GL does
--    NOT recompute those — it records balanced journal entries alongside them.
--  • TEXT primary keys + timestamptz, matching every existing table.
--  • Accounts carry an optional `system_key` so the posting engine can resolve
--    canonical accounts (bank / ar / ap / gst_output …) without hardcoding ids.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Finance permissions (extend the 0019 catalog) + grants
-- ---------------------------------------------------------------------------
insert into public.hr_permissions (key, module, label, description, sort) values
  ('ACCOUNTS_VIEW',    'Accounts', 'View accounting',        'Chart of accounts, ledgers, journals', 200),
  ('ACCOUNTS_MANAGE',  'Accounts', 'Manage chart of accounts','Create/edit accounts + periods',      201),
  ('JOURNAL_POST',     'Accounts', 'Post journal entries',   'Create and post balanced journals',    202),
  ('BANK_MANAGE',      'Banking',  'Manage bank accounts',   null, 210),
  ('BANK_IMPORT',      'Banking',  'Import bank statements',  'Upload + review + post statements',    211),
  ('RECON_MANAGE',     'Banking',  'Bank reconciliation',    null, 212),
  ('GST_VIEW',         'GST',      'View GST',               null, 220),
  ('GST_MANAGE',       'GST',      'Manage GST',             'Registrations, rates, returns',        221),
  ('EINVOICE_MANAGE',  'GST',      'Manage e-invoice',       null, 222),
  ('EWAYBILL_MANAGE',  'GST',      'Manage e-way bills',     null, 223)
on conflict (key) do update
  set module = excluded.module, label = excluded.label,
      description = excluded.description, sort = excluded.sort;

-- HR Admin already gets every permission via the 0019 "all permissions" grant,
-- but that ran before these rows existed — re-run it so finance perms attach.
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_admin', key, 'all' from public.hr_permissions
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- HR Manager: operational finance at company scope (no COA structural changes).
insert into public.hr_role_permissions (role_id, permission_key, scope) values
  ('role_hr_manager','ACCOUNTS_VIEW','company'),
  ('role_hr_manager','JOURNAL_POST','company'),
  ('role_hr_manager','BANK_MANAGE','company'),
  ('role_hr_manager','BANK_IMPORT','company'),
  ('role_hr_manager','RECON_MANAGE','company'),
  ('role_hr_manager','GST_VIEW','company')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- 2. Chart of accounts (hierarchical, configurable)
-- ---------------------------------------------------------------------------
create table if not exists public.chart_of_accounts (
  id           text primary key,
  company_id   text references public.companies(id),  -- null = shared/all companies
  code         text not null,
  name         text not null,
  type         text not null check (type in ('asset','liability','equity','income','expense')),
  parent_id    text references public.chart_of_accounts(id),
  is_group     boolean not null default false,        -- group headers are not postable
  system_key   text,                                  -- 'bank','ar','ap','gst_output',…
  gst_relevant boolean not null default false,
  opening_balance numeric not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists idx_coa_code
  on public.chart_of_accounts (coalesce(company_id, '*'), lower(code));
create index if not exists idx_coa_company on public.chart_of_accounts (company_id);
create index if not exists idx_coa_parent on public.chart_of_accounts (parent_id);
create index if not exists idx_coa_type on public.chart_of_accounts (type);
create index if not exists idx_coa_system_key on public.chart_of_accounts (system_key)
  where system_key is not null;

-- ---------------------------------------------------------------------------
-- 3. Fiscal years + accounting periods (open / closed / locked)
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_years (
  id         text primary key,
  company_id text references public.companies(id),
  name       text not null,                           -- e.g. '2026-27'
  start_date date not null,
  end_date   date not null,
  status     text not null default 'open' check (status in ('open','closed','locked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_fy_name on public.fiscal_years (coalesce(company_id,'*'), name);

create table if not exists public.accounting_periods (
  id             text primary key,
  fiscal_year_id text not null references public.fiscal_years(id) on delete cascade,
  company_id     text references public.companies(id),
  name           text not null,                        -- e.g. '2026-04'
  start_date     date not null,
  end_date       date not null,
  status         text not null default 'open' check (status in ('open','closed','locked')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists idx_period_name on public.accounting_periods (fiscal_year_id, name);
create index if not exists idx_period_dates on public.accounting_periods (start_date, end_date);

-- ---------------------------------------------------------------------------
-- 4. Journals + lines (double-entry)
-- ---------------------------------------------------------------------------
create table if not exists public.journals (
  id          text primary key,
  company_id  text references public.companies(id),
  journal_no  text,
  date        date not null default current_date,
  period_id   text references public.accounting_periods(id),
  narration   text,
  source      text not null default 'manual',          -- manual|invoice|payment|receipt|expense|bank_import|opening|system
  source_type text,                                     -- entity table
  source_id   text,                                     -- entity id (traceability)
  status      text not null default 'draft' check (status in ('draft','posted','void')),
  created_by  text,
  posted_by   text,
  posted_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_journals_date on public.journals (date);
create index if not exists idx_journals_status on public.journals (status);
create index if not exists idx_journals_source on public.journals (source_type, source_id);

create table if not exists public.journal_lines (
  id          text primary key,
  journal_id  text not null references public.journals(id) on delete cascade,
  account_id  text not null references public.chart_of_accounts(id),
  debit       numeric not null default 0 check (debit >= 0),
  credit      numeric not null default 0 check (credit >= 0),
  description text,
  party_type  text,                                     -- 'customer'|'vendor'|'employee'|'other'
  party_id    text,
  line_no     int
);
create index if not exists idx_jlines_journal on public.journal_lines (journal_id);
create index if not exists idx_jlines_account on public.journal_lines (account_id);
create index if not exists idx_jlines_party on public.journal_lines (party_type, party_id);

-- ---------------------------------------------------------------------------
-- 5. Bank accounts (company's own bank accounts)
-- ---------------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id              text primary key,
  company_id      text references public.companies(id),
  name            text not null,
  bank_name       text,
  account_number  text,                                 -- masked in UI
  ifsc            text,
  branch          text,
  account_type    text,                                 -- current|savings|cc|od
  opening_balance numeric not null default 0,
  ledger_account_id text references public.chart_of_accounts(id),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_bank_accounts_company on public.bank_accounts (company_id);

-- ---------------------------------------------------------------------------
-- 6. Views — general ledger + trial balance (posted journals only)
-- ---------------------------------------------------------------------------
create or replace view public.general_ledger as
  select
    jl.id            as line_id,
    j.id             as journal_id,
    j.journal_no,
    j.date,
    j.company_id,
    j.narration,
    j.source,
    j.source_type,
    j.source_id,
    jl.account_id,
    coa.code         as account_code,
    coa.name         as account_name,
    coa.type         as account_type,
    jl.debit,
    jl.credit,
    jl.description,
    jl.party_type,
    jl.party_id
  from public.journal_lines jl
  join public.journals j on j.id = jl.journal_id and j.status = 'posted'
  join public.chart_of_accounts coa on coa.id = jl.account_id;

create or replace view public.trial_balance as
  select
    coa.id           as account_id,
    coa.code         as account_code,
    coa.name         as account_name,
    coa.type         as account_type,
    coa.company_id,
    coa.opening_balance,
    coalesce(sum(jl.debit), 0)  as total_debit,
    coalesce(sum(jl.credit), 0) as total_credit,
    coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) as balance
  from public.chart_of_accounts coa
  left join public.journal_lines jl on jl.account_id = coa.id
  left join public.journals j on j.id = jl.journal_id and j.status = 'posted'
  where coa.is_group = false
  group by coa.id, coa.code, coa.name, coa.type, coa.company_id, coa.opening_balance;

-- ---------------------------------------------------------------------------
-- 7. Helper: resolve a system account id by key (for the posting engine)
-- ---------------------------------------------------------------------------
create or replace function public.acc_system(p_key text, p_company_id text default null)
returns text language sql stable security definer set search_path = public as $$
  select id from public.chart_of_accounts
  where system_key = p_key
    and (company_id is null or p_company_id is null or company_id = p_company_id)
  order by (company_id = p_company_id) desc nulls last
  limit 1;
$$;

-- Resolve the open period covering a date (for posting validation).
create or replace function public.acc_period_for(p_date date, p_company_id text default null)
returns text language sql stable security definer set search_path = public as $$
  select id from public.accounting_periods
  where p_date between start_date and end_date
    and (company_id is null or p_company_id is null or company_id = p_company_id)
  order by (company_id = p_company_id) desc nulls last
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 8. post_journal — the ONLY way rule-bearing journals get created. Validates
--    balance (sum debit = sum credit, > 0), that the period is not locked, and
--    writes header + lines atomically. Returns the journal id.
-- ---------------------------------------------------------------------------
create or replace function public.post_journal(
  p_company_id text,
  p_date date,
  p_narration text,
  p_lines jsonb,                 -- [{account_id, debit, credit, description, party_type, party_id}]
  p_source text default 'manual',
  p_source_type text default null,
  p_source_id text default null,
  p_status text default 'posted'
) returns text language plpgsql security definer set search_path = public as $$
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
  if not (public.hr_has_permission('JOURNAL_POST') or public.is_hr_admin()) then
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
end $$;

-- Void a posted journal (reversal-safe: keeps the row, flips status). Locked
-- periods block voiding too.
create or replace function public.void_journal(p_id text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_j record; v_period_status text;
begin
  if not (public.hr_has_permission('JOURNAL_POST') or public.is_hr_admin()) then
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
end $$;

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------
do $$
declare spec record;
begin
  for spec in
    select * from (values
      ('chart_of_accounts',  'ACCOUNTS_VIEW', 'ACCOUNTS_MANAGE'),
      ('fiscal_years',       'ACCOUNTS_VIEW', 'ACCOUNTS_MANAGE'),
      ('accounting_periods', 'ACCOUNTS_VIEW', 'ACCOUNTS_MANAGE'),
      ('journals',           'ACCOUNTS_VIEW', 'JOURNAL_POST'),
      ('journal_lines',      'ACCOUNTS_VIEW', 'JOURNAL_POST'),
      ('bank_accounts',      'ACCOUNTS_VIEW', 'BANK_MANAGE')
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
-- 10. Seed — a default Indian chart of accounts (shared / company_id null).
--     Groups first, then postable leaves. system_key wires the posting engine.
-- ---------------------------------------------------------------------------
insert into public.chart_of_accounts (id, code, name, type, parent_id, is_group, system_key, gst_relevant) values
  -- Groups
  ('coa_assets',      '1000','Assets',                 'asset',    null,          true, null, false),
  ('coa_ca',          '1100','Current Assets',         'asset',    'coa_assets',  true, null, false),
  ('coa_liab',        '2000','Liabilities',            'liability',null,          true, null, false),
  ('coa_cl',          '2100','Current Liabilities',    'liability','coa_liab',    true, null, false),
  ('coa_equity',      '3000','Equity',                 'equity',   null,          true, null, false),
  ('coa_income',      '4000','Income',                 'income',   null,          true, null, false),
  ('coa_expense',     '5000','Expenses',               'expense',  null,          true, null, false),
  -- Assets (postable)
  ('coa_cash',        '1101','Cash in Hand',           'asset',    'coa_ca', false, 'cash', false),
  ('coa_bank',        '1102','Bank Accounts',          'asset',    'coa_ca', false, 'bank', false),
  ('coa_ar',          '1103','Accounts Receivable',    'asset',    'coa_ca', false, 'ar', false),
  ('coa_gst_input',   '1104','GST Input Tax Credit',   'asset',    'coa_ca', false, 'gst_input', true),
  ('coa_advned',      '1105','Advances / Deposits',    'asset',    'coa_ca', false, null, false),
  -- Liabilities (postable)
  ('coa_ap',          '2101','Accounts Payable',       'liability','coa_cl', false, 'ap', false),
  ('coa_gst_output',  '2102','GST Payable (Output)',   'liability','coa_cl', false, 'gst_output', true),
  ('coa_tds_payable', '2103','TDS Payable',            'liability','coa_cl', false, 'tds_payable', false),
  ('coa_other_pay',   '2104','Other Payables',         'liability','coa_cl', false, null, false),
  -- Income (postable)
  ('coa_sales',       '4001','Sales',                  'income',   'coa_income', false, 'sales', true),
  ('coa_service',     '4002','Service Income',         'income',   'coa_income', false, null, true),
  ('coa_other_inc',   '4003','Other Income',           'income',   'coa_income', false, 'other_income', false),
  ('coa_round_inc',   '4004','Rounding Gain',          'income',   'coa_income', false, 'round_off', false),
  -- Expenses (postable)
  ('coa_purchase',    '5001','Purchases',              'expense',  'coa_expense', false, 'purchase', true),
  ('coa_salary',      '5002','Salary & Wages',         'expense',  'coa_expense', false, 'salary', false),
  ('coa_rent',        '5003','Rent',                   'expense',  'coa_expense', false, 'rent', false),
  ('coa_power',       '5004','Electricity & Power',    'expense',  'coa_expense', false, null, false),
  ('coa_bankchg',     '5005','Bank Charges',           'expense',  'coa_expense', false, 'bank_charges', false),
  ('coa_gstexp',      '5006','GST on Expenses',        'expense',  'coa_expense', false, null, true),
  ('coa_other_exp',   '5007','Other Expenses',         'expense',  'coa_expense', false, 'other_expense', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.acc_system(text, text) to authenticated;
grant execute on function public.acc_period_for(date, text) to authenticated;
grant execute on function public.post_journal(text, date, text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.void_journal(text, text) to authenticated;
grant select on public.general_ledger to authenticated;
grant select on public.trial_balance to authenticated;
