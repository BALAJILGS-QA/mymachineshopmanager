-- ============================================================================
-- HRM payroll engine + documents, assets, advances, expenses, recruitment,
-- performance and training. Builds on 0019 (RBAC) and 0020 (employees).
-- ============================================================================
-- Design notes
--  • Configurable payroll: components are data, not code. A salary structure is
--    a bundle of component lines; an employee is assigned a structure with an
--    effective window (history preserved). A payroll run snapshots earnings /
--    deductions per employee into payroll_records so finalised figures never
--    change even if the structure later does.
--  • No jurisdiction/tax rule is hardcoded — statutory items are ordinary
--    components flagged is_statutory, computed by the configured rule.
--  • Additive + idempotent. Same TEXT-pk / timestamptz conventions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Salary structures & components
-- ---------------------------------------------------------------------------
create table if not exists public.salary_components (
  id          text primary key,
  company_id  text references public.companies(id),
  code        text not null,
  name        text not null,
  kind        text not null default 'earning',   -- earning|deduction
  calc_type   text not null default 'fixed',      -- fixed|percent_of_basic|percent_of_gross|formula
  is_statutory boolean not null default false,
  taxable     boolean not null default true,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists idx_salcomp_code
  on public.salary_components (coalesce(company_id, '*'), lower(code));

create table if not exists public.salary_structures (
  id          text primary key,
  company_id  text references public.companies(id),
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.salary_structure_lines (
  id            text primary key,
  structure_id  text not null references public.salary_structures(id) on delete cascade,
  component_id  text not null references public.salary_components(id),
  amount        numeric not null default 0,       -- fixed amount, or the % value
  sort          int not null default 0
);
create index if not exists idx_sal_lines_structure on public.salary_structure_lines (structure_id);

-- Employee ↔ structure assignment with an effective window (history kept).
create table if not exists public.employee_salary (
  id            text primary key,
  employee_id   text not null references public.employees(id) on delete cascade,
  structure_id  text references public.salary_structures(id),
  ctc           numeric,                            -- optional annual cost-to-company
  effective_from date not null default current_date,
  effective_to  date,
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists idx_emp_salary_emp on public.employee_salary (employee_id);

-- ---------------------------------------------------------------------------
-- 2. Payroll periods / runs / records
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_periods (
  id          text primary key,
  company_id  text references public.companies(id),
  name        text not null,                       -- e.g. "2026-09"
  start_date  date not null,
  end_date    date not null,
  pay_date    date,
  status      text not null default 'draft',       -- draft|processing|calculated|reviewed|approved|finalized|locked
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists idx_payroll_periods_uniq
  on public.payroll_periods (coalesce(company_id, '*'), name);

create table if not exists public.payroll_runs (
  id          text primary key,
  period_id   text not null references public.payroll_periods(id) on delete cascade,
  company_id  text references public.companies(id),
  status      text not null default 'draft',       -- draft|calculated|approved|finalized
  run_at      timestamptz not null default now(),
  run_by      text,
  employee_count int not null default 0,
  gross_total numeric not null default 0,
  deduction_total numeric not null default 0,
  net_total   numeric not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_payroll_runs_period on public.payroll_runs (period_id);

create table if not exists public.payroll_records (
  id            text primary key,
  run_id        text not null references public.payroll_runs(id) on delete cascade,
  period_id     text not null references public.payroll_periods(id) on delete cascade,
  employee_id   text not null references public.employees(id),
  gross         numeric not null default 0,
  total_deductions numeric not null default 0,
  net           numeric not null default 0,
  paid_days     numeric,
  lop_days      numeric,                            -- loss-of-pay days
  earnings      jsonb not null default '[]'::jsonb, -- [{code,name,amount}]
  deductions    jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);
create unique index if not exists idx_payroll_records_uniq
  on public.payroll_records (run_id, employee_id);
create index if not exists idx_payroll_records_emp on public.payroll_records (employee_id);

-- ---------------------------------------------------------------------------
-- 3. Documents & assets
-- ---------------------------------------------------------------------------
create table if not exists public.document_types (
  id         text primary key,
  company_id text references public.companies(id),
  code       text not null,
  name       text not null,
  has_expiry boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_doctypes_code
  on public.document_types (coalesce(company_id, '*'), lower(code));

create table if not exists public.employee_documents (
  id            text primary key,
  company_id    text references public.companies(id),
  employee_id   text not null references public.employees(id) on delete cascade,
  document_type_id text references public.document_types(id),
  title         text not null,
  document_no   text,
  issue_date    date,
  expiry_date   date,
  file_path     text,                                -- Supabase Storage path (not public URL)
  status        text not null default 'active',
  remarks       text,
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists idx_emp_docs_emp on public.employee_documents (employee_id);
create index if not exists idx_emp_docs_expiry on public.employee_documents (expiry_date);

create table if not exists public.employee_assets (
  id          text primary key,
  company_id  text references public.companies(id),
  code        text,
  name        text not null,
  category    text,
  serial_no   text,
  status      text not null default 'available',    -- available|assigned|retired
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.asset_assignments (
  id            text primary key,
  asset_id      text not null references public.employee_assets(id) on delete cascade,
  employee_id   text not null references public.employees(id) on delete cascade,
  assigned_date date not null default current_date,
  condition_out text,
  expected_return date,
  returned_date date,
  condition_in  text,
  remarks       text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_asset_assign_emp on public.asset_assignments (employee_id);
create index if not exists idx_asset_assign_asset on public.asset_assignments (asset_id);

-- ---------------------------------------------------------------------------
-- 4. Advances & expenses
-- ---------------------------------------------------------------------------
create table if not exists public.employee_advances (
  id            text primary key,
  company_id    text references public.companies(id),
  employee_id   text not null references public.employees(id) on delete cascade,
  amount        numeric not null,
  reason        text,
  advance_date  date not null default current_date,
  installments  int not null default 1,
  outstanding   numeric not null,
  status        text not null default 'pending',    -- pending|approved|active|closed|rejected
  approved_by   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_advances_emp on public.employee_advances (employee_id);

create table if not exists public.advance_repayments (
  id          text primary key,
  advance_id  text not null references public.employee_advances(id) on delete cascade,
  amount      numeric not null,
  paid_date   date not null default current_date,
  period_id   text references public.payroll_periods(id),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_repay_advance on public.advance_repayments (advance_id);

create table if not exists public.expense_categories (
  id         text primary key,
  company_id text references public.companies(id),
  code       text not null,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_expcat_code
  on public.expense_categories (coalesce(company_id, '*'), lower(code));

create table if not exists public.expense_claims (
  id           text primary key,
  company_id   text references public.companies(id),
  employee_id  text not null references public.employees(id) on delete cascade,
  category_id  text references public.expense_categories(id),
  amount       numeric not null,
  claim_date   date not null default current_date,
  description  text,
  receipt_path text,
  status       text not null default 'submitted',   -- draft|submitted|approved|rejected|paid
  approver     text,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_expclaims_emp on public.expense_claims (employee_id);
create index if not exists idx_expclaims_status on public.expense_claims (status);

-- ---------------------------------------------------------------------------
-- 5. Recruitment
-- ---------------------------------------------------------------------------
create table if not exists public.job_openings (
  id            text primary key,
  company_id    text references public.companies(id),
  title         text not null,
  department_id text references public.departments(id),
  designation_id text references public.designations(id),
  location      text,
  employment_type text,
  openings      int not null default 1,
  description   text,
  requirements  text,
  status        text not null default 'open',       -- draft|open|on_hold|closed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_job_openings_status on public.job_openings (status);

create table if not exists public.candidates (
  id           text primary key,
  company_id   text references public.companies(id),
  job_id       text references public.job_openings(id) on delete set null,
  name         text not null,
  email        text,
  phone        text,
  resume_path  text,
  source       text,
  stage        text not null default 'applied',     -- applied|screening|interview|selected|rejected|offer|joined
  rating       numeric,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_candidates_job on public.candidates (job_id);
create index if not exists idx_candidates_stage on public.candidates (stage);

create table if not exists public.interview_rounds (
  id           text primary key,
  candidate_id text not null references public.candidates(id) on delete cascade,
  round_no     int not null default 1,
  interviewer  text,
  scheduled_at timestamptz,
  mode         text,
  status       text not null default 'scheduled',   -- scheduled|completed|cancelled
  rating       numeric,
  feedback     text,
  decision     text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_interviews_candidate on public.interview_rounds (candidate_id);

create table if not exists public.job_offers (
  id           text primary key,
  candidate_id text not null references public.candidates(id) on delete cascade,
  designation_id text references public.designations(id),
  department_id  text references public.departments(id),
  ctc          numeric,
  joining_date date,
  offer_date   date not null default current_date,
  expiry_date  date,
  status       text not null default 'draft',        -- draft|sent|accepted|rejected|expired
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_offers_candidate on public.job_offers (candidate_id);

-- ---------------------------------------------------------------------------
-- 6. Performance
-- ---------------------------------------------------------------------------
create table if not exists public.performance_cycles (
  id          text primary key,
  company_id  text references public.companies(id),
  name        text not null,
  start_date  date,
  end_date    date,
  rating_scale int not null default 5,
  status      text not null default 'active',        -- draft|active|closed
  created_at  timestamptz not null default now()
);

create table if not exists public.performance_reviews (
  id           text primary key,
  cycle_id     text not null references public.performance_cycles(id) on delete cascade,
  employee_id  text not null references public.employees(id) on delete cascade,
  reviewer_id  text references public.employees(id),
  self_rating  numeric,
  manager_rating numeric,
  final_rating numeric,
  status       text not null default 'pending',      -- pending|self|manager|completed
  comments     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_perf_reviews_emp on public.performance_reviews (employee_id);
create index if not exists idx_perf_reviews_cycle on public.performance_reviews (cycle_id);

create table if not exists public.performance_goals (
  id           text primary key,
  review_id    text not null references public.performance_reviews(id) on delete cascade,
  title        text not null,
  target       text,
  weight       numeric,
  achievement  text,
  rating       numeric,
  created_at   timestamptz not null default now()
);
create index if not exists idx_perf_goals_review on public.performance_goals (review_id);

-- ---------------------------------------------------------------------------
-- 7. Training
-- ---------------------------------------------------------------------------
create table if not exists public.training_programs (
  id          text primary key,
  company_id  text references public.companies(id),
  code        text,
  name        text not null,
  category    text,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.training_sessions (
  id          text primary key,
  program_id  text not null references public.training_programs(id) on delete cascade,
  trainer     text,
  start_date  date,
  end_date    date,
  duration_hours numeric,
  location    text,
  status      text not null default 'scheduled',     -- scheduled|ongoing|completed|cancelled
  created_at  timestamptz not null default now()
);
create index if not exists idx_training_sessions_program on public.training_sessions (program_id);

create table if not exists public.employee_training (
  id           text primary key,
  session_id   text not null references public.training_sessions(id) on delete cascade,
  employee_id  text not null references public.employees(id) on delete cascade,
  status       text not null default 'enrolled',      -- enrolled|attended|completed|dropped
  completion_date date,
  certificate_path text,
  created_at   timestamptz not null default now()
);
create unique index if not exists idx_emp_training_uniq
  on public.employee_training (session_id, employee_id);
create index if not exists idx_emp_training_emp on public.employee_training (employee_id);

-- ---------------------------------------------------------------------------
-- 8. RLS — permission-gated read/write. Self-service tables also allow the
--    owning employee to read their own rows.
-- ---------------------------------------------------------------------------
do $$
declare spec record;
begin
  for spec in
    select * from (values
      -- table,                  read_perm,        write_perm,        self_col
      ('salary_components',      'PAYROLL_VIEW',   'PAYROLL_PROCESS', null),
      ('salary_structures',      'PAYROLL_VIEW',   'PAYROLL_PROCESS', null),
      ('salary_structure_lines', 'PAYROLL_VIEW',   'PAYROLL_PROCESS', null),
      ('employee_salary',        'PAYROLL_VIEW',   'PAYROLL_PROCESS', 'employee_id'),
      ('payroll_periods',        'PAYROLL_VIEW',   'PAYROLL_PROCESS', null),
      ('payroll_runs',           'PAYROLL_VIEW',   'PAYROLL_PROCESS', null),
      ('payroll_records',        'PAYROLL_VIEW',   'PAYROLL_PROCESS', 'employee_id'),
      ('document_types',         'DOCUMENT_VIEW',  'DOCUMENT_UPLOAD', null),
      ('employee_documents',     'DOCUMENT_VIEW',  'DOCUMENT_UPLOAD', 'employee_id'),
      ('employee_assets',        'ASSET_MANAGE',   'ASSET_MANAGE',    null),
      ('asset_assignments',      'ASSET_MANAGE',   'ASSET_MANAGE',    'employee_id'),
      ('employee_advances',      'ADVANCE_MANAGE', 'ADVANCE_MANAGE',  'employee_id'),
      ('advance_repayments',     'ADVANCE_MANAGE', 'ADVANCE_MANAGE',  null),
      ('expense_categories',     'EXPENSE_VIEW',   'EXPENSE_APPROVE', null),
      ('expense_claims',         'EXPENSE_VIEW',   'EXPENSE_APPROVE', 'employee_id'),
      ('job_openings',           'RECRUITMENT_VIEW','RECRUITMENT_MANAGE', null),
      ('candidates',             'RECRUITMENT_VIEW','RECRUITMENT_MANAGE', null),
      ('interview_rounds',       'RECRUITMENT_VIEW','RECRUITMENT_MANAGE', null),
      ('job_offers',             'RECRUITMENT_VIEW','RECRUITMENT_MANAGE', null),
      ('performance_cycles',     'PERFORMANCE_VIEW','PERFORMANCE_MANAGE', null),
      ('performance_reviews',    'PERFORMANCE_VIEW','PERFORMANCE_MANAGE', 'employee_id'),
      ('performance_goals',      'PERFORMANCE_VIEW','PERFORMANCE_MANAGE', null),
      ('training_programs',      'TRAINING_VIEW',  'TRAINING_MANAGE',  null),
      ('training_sessions',      'TRAINING_VIEW',  'TRAINING_MANAGE',  null),
      ('employee_training',      'TRAINING_VIEW',  'TRAINING_MANAGE',  'employee_id')
    ) as t(tbl, read_perm, write_perm, self_col)
  loop
    execute format('alter table public.%I enable row level security;', spec.tbl);
    execute format('drop policy if exists p_read on public.%I;', spec.tbl);
    if spec.self_col is null then
      execute format($f$create policy p_read on public.%I for select to authenticated
        using (public.hr_has_permission(%L) or public.is_hr_admin());$f$,
        spec.tbl, spec.read_perm);
    else
      execute format($f$create policy p_read on public.%I for select to authenticated
        using (public.hr_has_permission(%L) or public.is_hr_admin()
               or %I = public.hr_current_employee_id());$f$,
        spec.tbl, spec.read_perm, spec.self_col);
    end if;
    execute format('drop policy if exists p_write on public.%I;', spec.tbl);
    execute format($f$create policy p_write on public.%I for all to authenticated
      using (public.hr_has_permission(%L) or public.is_hr_admin())
      with check (public.hr_has_permission(%L) or public.is_hr_admin());$f$,
      spec.tbl, spec.write_perm, spec.write_perm);
  end loop;
end $$;

-- Self-service inserts: an employee may raise their own leave (0020), expense
-- claim and document upload. Add scoped insert policies for those.
drop policy if exists ec_self_insert on public.expense_claims;
create policy ec_self_insert on public.expense_claims for insert to authenticated
  with check (
    public.hr_has_permission('EXPENSE_APPROVE') or public.is_hr_admin()
    or (employee_id = public.hr_current_employee_id() and public.hr_has_permission('HRM_VIEW'))
  );

-- ---------------------------------------------------------------------------
-- 9. Payroll processing RPC — atomic run over a period.
-- ---------------------------------------------------------------------------
-- Computes each active employee's earnings/deductions from their assigned salary
-- structure, snapshots per-employee records, and totals the run. Refuses to run
-- twice for a finalized/locked period (unless force + authorized).
create or replace function public.hr_run_payroll(
  p_period_id text, p_force boolean default false
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_period record;
  v_run_id text;
  v_emp record;
  v_struct_id text;
  v_line record;
  v_basic numeric;
  v_gross numeric;
  v_ded numeric;
  v_earnings jsonb;
  v_deductions jsonb;
  v_amt numeric;
  v_run_gross numeric := 0;
  v_run_ded numeric := 0;
  v_run_net numeric := 0;
  v_count int := 0;
begin
  if not (public.hr_has_permission('PAYROLL_PROCESS') or public.is_hr_admin()) then
    raise exception 'Not authorized to process payroll';
  end if;
  select * into v_period from public.payroll_periods where id = p_period_id for update;
  if v_period is null then raise exception 'Unknown payroll period'; end if;
  if v_period.status in ('finalized','locked') and not p_force then
    raise exception 'Period is % — cannot reprocess', v_period.status;
  end if;

  -- Remove any prior draft run for this period (idempotent reprocess).
  delete from public.payroll_runs where period_id = p_period_id and status = 'draft';

  v_run_id := 'prun_' || substr(md5(random()::text || clock_timestamp()::text),1,16);
  insert into public.payroll_runs (id, period_id, company_id, status, run_by)
  values (v_run_id, p_period_id, v_period.company_id, 'calculated', public.hr_current_email());

  for v_emp in
    select * from public.employees
    where status in ('active','probation','on_leave')
      and archived_at is null
      and (v_period.company_id is null or company_id is null or company_id = v_period.company_id)
  loop
    -- Resolve the salary structure effective for this period.
    select structure_id into v_struct_id from public.employee_salary
      where employee_id = v_emp.id
        and effective_from <= v_period.end_date
        and (effective_to is null or effective_to >= v_period.start_date)
      order by effective_from desc limit 1;
    if v_struct_id is null then continue; end if;

    -- Basic = fixed earning component named/coded 'BASIC' if present, else the
    -- first earning line. Used as the base for percent_of_basic components.
    select coalesce(sum(l.amount), 0) into v_basic
      from public.salary_structure_lines l
      join public.salary_components c on c.id = l.component_id
      where l.structure_id = v_struct_id and c.kind = 'earning'
        and c.calc_type = 'fixed' and lower(c.code) = 'basic';

    v_gross := 0; v_ded := 0;
    v_earnings := '[]'::jsonb; v_deductions := '[]'::jsonb;

    for v_line in
      select l.amount, c.code, c.name, c.kind, c.calc_type
      from public.salary_structure_lines l
      join public.salary_components c on c.id = l.component_id
      where l.structure_id = v_struct_id and c.active
      order by c.sort, l.sort
    loop
      v_amt := case v_line.calc_type
        when 'fixed' then v_line.amount
        when 'percent_of_basic' then round(v_basic * v_line.amount / 100.0, 2)
        when 'percent_of_gross' then round(v_gross * v_line.amount / 100.0, 2)
        else v_line.amount end;
      if v_line.kind = 'earning' then
        v_gross := v_gross + v_amt;
        v_earnings := v_earnings || jsonb_build_object('code', v_line.code, 'name', v_line.name, 'amount', v_amt);
      else
        v_ded := v_ded + v_amt;
        v_deductions := v_deductions || jsonb_build_object('code', v_line.code, 'name', v_line.name, 'amount', v_amt);
      end if;
    end loop;

    insert into public.payroll_records
      (id, run_id, period_id, employee_id, gross, total_deductions, net, earnings, deductions)
    values
      ('prec_' || substr(md5(random()::text || clock_timestamp()::text),1,16),
       v_run_id, p_period_id, v_emp.id, v_gross, v_ded, v_gross - v_ded, v_earnings, v_deductions);

    v_run_gross := v_run_gross + v_gross;
    v_run_ded := v_run_ded + v_ded;
    v_run_net := v_run_net + (v_gross - v_ded);
    v_count := v_count + 1;
  end loop;

  update public.payroll_runs
    set employee_count = v_count, gross_total = v_run_gross,
        deduction_total = v_run_ded, net_total = v_run_net, updated_at = now()
    where id = v_run_id;
  update public.payroll_periods set status = 'calculated', updated_at = now() where id = p_period_id;

  perform public.hr_log('process', 'payroll_run', v_run_id,
    'Payroll processed for ' || v_period.name || ' (' || v_count || ' employees)',
    null, jsonb_build_object('gross', v_run_gross, 'net', v_run_net), v_period.company_id);
  return v_run_id;
end $$;

-- Finalize / lock a period (four-eyes: needs PAYROLL_FINALIZE).
create or replace function public.hr_finalize_payroll(p_period_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_period record;
begin
  if not (public.hr_has_permission('PAYROLL_FINALIZE') or public.is_hr_admin()) then
    raise exception 'Not authorized to finalize payroll';
  end if;
  select * into v_period from public.payroll_periods where id = p_period_id for update;
  if v_period is null then raise exception 'Unknown payroll period'; end if;
  if v_period.status not in ('calculated','reviewed','approved') then
    raise exception 'Period cannot be finalized from status %', v_period.status;
  end if;
  update public.payroll_periods set status = 'finalized', updated_at = now() where id = p_period_id;
  update public.payroll_runs set status = 'finalized', updated_at = now()
    where period_id = p_period_id and status = 'calculated';
  perform public.hr_log('finalize', 'payroll_period', p_period_id,
    'Payroll finalized for ' || v_period.name, null, null, v_period.company_id);
end $$;

grant execute on function public.hr_run_payroll(text, boolean) to authenticated;
grant execute on function public.hr_finalize_payroll(text) to authenticated;
