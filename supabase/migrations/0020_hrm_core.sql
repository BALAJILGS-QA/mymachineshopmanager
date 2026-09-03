-- ============================================================================
-- HRM core: organisation (departments, designations), the employee master and
-- its history, shifts + assignments, holidays, leave (types / balances /
-- applications) and attendance — plus the atomic RPCs those slices need.
-- ============================================================================
-- Design notes
--  • Builds on 0019 (RBAC helpers hr_has_permission/hr_permission_scope,
--    is_hr_admin, is_app_approved, is_super_admin, hr_log, hr_notify).
--  • Additive + idempotent (create ... if not exists / or replace). Touches NO
--    existing table. Safe to re-run.
--  • Same primitives as every existing table: TEXT primary keys, timestamptz
--    created_at/updated_at, company_id text references companies(id) for tenant
--    scoping.
--  • RLS pattern: read requires the matching *_VIEW permission (or self-access
--    for the caller's own employee row); writes require the create/edit/manage
--    permission. Finer scope (team/department) is enforced in the service/RPC
--    layer; the DB floor is "hold the permission".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Organisation — departments & designations
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id           text primary key,
  company_id   text references public.companies(id),
  code         text not null,
  name         text not null,
  description  text,
  parent_id    text references public.departments(id),
  head_employee_id text,                        -- FK added after employees exists
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists idx_departments_code
  on public.departments (coalesce(company_id, '*'), lower(code));
create index if not exists idx_departments_company on public.departments (company_id);
create index if not exists idx_departments_parent on public.departments (parent_id);

create table if not exists public.designations (
  id            text primary key,
  company_id    text references public.companies(id),
  code          text not null,
  name          text not null,
  department_id text references public.departments(id),
  grade         text,
  description   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists idx_designations_code
  on public.designations (coalesce(company_id, '*'), lower(code));
create index if not exists idx_designations_company on public.designations (company_id);

-- ---------------------------------------------------------------------------
-- 2. Employee master (+ related detail kept in the same row where 1:1 and
--    small; sensitive banking/statutory grouped but access-gated by RLS+API).
-- ---------------------------------------------------------------------------
create table if not exists public.employees (
  id                text primary key,
  company_id        text references public.companies(id),
  employee_code     text not null,                 -- EMP-000001 (immutable)
  -- Identity
  first_name        text not null,
  middle_name       text,
  last_name         text,
  display_name      text,
  photo_url         text,
  gender            text,                           -- male|female|other|undisclosed
  date_of_birth     date,
  nationality       text,
  marital_status    text,
  -- Contact
  personal_email    text,
  work_email        text,
  mobile            text,
  alternate_mobile  text,
  address_line      text,
  city              text,
  state             text,
  country           text,
  postal_code       text,
  emergency_name    text,
  emergency_relation text,
  emergency_phone   text,
  -- Employment
  date_of_joining   date,
  employment_type   text,                           -- full_time|part_time|contract|intern|temporary
  department_id     text references public.departments(id),
  designation_id    text references public.designations(id),
  reporting_manager_id text references public.employees(id),
  location          text,
  branch            text,
  work_location     text,
  shift_id          text,                           -- FK added after shifts exists
  status            text not null default 'active', -- active|probation|on_leave|suspended|resigned|terminated|retired|inactive
  confirmation_date date,
  probation_months  int,
  notice_period_days int,
  date_of_leaving   date,
  reason_for_leaving text,
  -- Banking (sensitive)
  bank_account_no   text,
  bank_name         text,
  bank_ifsc         text,
  bank_account_holder text,
  payment_method    text,                           -- bank|cash|cheque|upi
  -- Statutory — extensible JSON so no jurisdiction is hardcoded
  statutory         jsonb not null default '{}'::jsonb,
  notes             text,
  archived_at       timestamptz,                     -- soft delete
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        text
);
create unique index if not exists idx_employees_code
  on public.employees (coalesce(company_id, '*'), lower(employee_code));
create index if not exists idx_employees_company on public.employees (company_id);
create index if not exists idx_employees_department on public.employees (department_id);
create index if not exists idx_employees_designation on public.employees (designation_id);
create index if not exists idx_employees_manager on public.employees (reporting_manager_id);
create index if not exists idx_employees_status on public.employees (status);
create index if not exists idx_employees_joining on public.employees (date_of_joining);
create index if not exists idx_employees_work_email on public.employees (lower(work_email));

-- Self-scope helper — the caller's own employee id (work_email/personal_email =
-- JWT email). Defined here, right after `employees` exists, because a `language
-- sql` function is parsed eagerly at creation (its referenced tables must exist).
-- Used by the RLS policies below and by 0021.
create or replace function public.hr_current_employee_id()
returns text language sql stable security definer set search_path = public as $$
  select e.id from public.employees e
  where lower(e.work_email) = public.hr_current_email()
     or lower(e.personal_email) = public.hr_current_email()
  limit 1;
$$;

-- department head FK now that employees exists
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'departments_head_fk') then
    alter table public.departments
      add constraint departments_head_fk
      foreign key (head_employee_id) references public.employees(id) on delete set null;
  end if;
end $$;

-- Employee status + department change history (audit trail for reports/compliance)
create table if not exists public.employee_status_history (
  id           text primary key,
  employee_id  text not null references public.employees(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  effective_date date not null default current_date,
  reason       text,
  created_at   timestamptz not null default now(),
  created_by   text
);
create index if not exists idx_emp_status_hist_emp on public.employee_status_history (employee_id);

-- ---------------------------------------------------------------------------
-- 3. Shifts & assignments (overnight-aware: end_time may be < start_time)
-- ---------------------------------------------------------------------------
create table if not exists public.shifts (
  id              text primary key,
  company_id      text references public.companies(id),
  code            text not null,
  name            text not null,
  start_time      time not null,
  end_time        time not null,
  break_minutes   int not null default 0,
  grace_minutes   int not null default 0,
  late_after_minutes int not null default 0,
  early_exit_minutes int not null default 0,
  ot_after_minutes int,                            -- overtime threshold (minutes worked)
  working_days    int[] not null default '{1,2,3,4,5,6}', -- ISO dow 1=Mon..7=Sun
  is_overnight    boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists idx_shifts_code
  on public.shifts (coalesce(company_id, '*'), lower(code));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employees_shift_fk') then
    alter table public.employees
      add constraint employees_shift_fk
      foreign key (shift_id) references public.shifts(id) on delete set null;
  end if;
end $$;

create table if not exists public.shift_assignments (
  id            text primary key,
  employee_id   text not null references public.employees(id) on delete cascade,
  shift_id      text not null references public.shifts(id) on delete cascade,
  effective_from date not null default current_date,
  effective_to  date,
  is_permanent  boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists idx_shift_assign_emp on public.shift_assignments (employee_id);

-- ---------------------------------------------------------------------------
-- 4. Holidays
-- ---------------------------------------------------------------------------
create table if not exists public.holidays (
  id           text primary key,
  company_id   text references public.companies(id),
  name         text not null,
  holiday_date date not null,
  type         text not null default 'company',   -- company|regional|optional
  location     text,
  department_id text references public.departments(id),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists idx_holidays_uniq
  on public.holidays (coalesce(company_id, '*'), holiday_date, lower(name), coalesce(location, '*'));
create index if not exists idx_holidays_date on public.holidays (holiday_date);

-- ---------------------------------------------------------------------------
-- 5. Leave — types, balances, applications
-- ---------------------------------------------------------------------------
create table if not exists public.leave_types (
  id            text primary key,
  company_id    text references public.companies(id),
  code          text not null,
  name          text not null,
  is_paid       boolean not null default true,
  annual_quota  numeric not null default 0,        -- days/year default entitlement
  accrual       text not null default 'yearly',    -- yearly|monthly|none
  carry_forward boolean not null default false,
  max_carry_forward numeric,
  allow_half_day boolean not null default true,
  allow_negative boolean not null default false,
  probation_eligible boolean not null default false,
  requires_hr_approval boolean not null default false, -- second-level after manager
  color         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists idx_leave_types_code
  on public.leave_types (coalesce(company_id, '*'), lower(code));

create table if not exists public.leave_balances (
  id            text primary key,
  employee_id   text not null references public.employees(id) on delete cascade,
  leave_type_id text not null references public.leave_types(id) on delete cascade,
  year          int not null,
  opening       numeric not null default 0,
  accrued       numeric not null default 0,
  used          numeric not null default 0,
  pending       numeric not null default 0,
  adjusted      numeric not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists idx_leave_balances_uniq
  on public.leave_balances (employee_id, leave_type_id, year);

create table if not exists public.leave_applications (
  id            text primary key,
  company_id    text references public.companies(id),
  employee_id   text not null references public.employees(id) on delete cascade,
  leave_type_id text not null references public.leave_types(id),
  start_date    date not null,
  end_date      date not null,
  is_half_day   boolean not null default false,
  half_day_part text,                              -- first|second
  days          numeric not null,                  -- computed working-day count
  reason        text,
  attachment_url text,
  status        text not null default 'submitted', -- draft|submitted|manager_approved|approved|rejected|cancelled
  manager_id    text references public.employees(id),
  decided_by    text,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_leave_apps_emp on public.leave_applications (employee_id);
create index if not exists idx_leave_apps_status on public.leave_applications (status);
create index if not exists idx_leave_apps_dates on public.leave_applications (start_date, end_date);

-- ---------------------------------------------------------------------------
-- 6. Attendance
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id             text primary key,
  company_id     text references public.companies(id),
  employee_id    text not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  shift_id       text references public.shifts(id),
  check_in       timestamptz,
  check_out      timestamptz,
  total_minutes  int,
  regular_minutes int,
  overtime_minutes int,
  status         text not null default 'present',  -- present|absent|half_day|late|early_exit|overtime|wfh|on_duty|holiday|weekly_off|leave
  source         text not null default 'manual',   -- manual|admin|biometric|import|api
  remarks        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     text
);
create unique index if not exists idx_attendance_uniq
  on public.attendance (employee_id, attendance_date);
create index if not exists idx_attendance_date on public.attendance (attendance_date);
create index if not exists idx_attendance_company on public.attendance (company_id);

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
-- Helper macro via DO blocks. Read = permission OR super-admin; write = perm.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('departments',          'DEPARTMENT_MANAGE', 'DEPARTMENT_MANAGE'),
      ('designations',         'DESIGNATION_MANAGE','DESIGNATION_MANAGE'),
      ('shifts',               'SHIFT_MANAGE',      'SHIFT_MANAGE'),
      ('shift_assignments',    'SHIFT_MANAGE',      'SHIFT_MANAGE'),
      ('holidays',             'HOLIDAY_MANAGE',    'HOLIDAY_MANAGE'),
      ('leave_types',          'LEAVE_VIEW',        'HOLIDAY_MANAGE')
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

-- Departments/designations/shifts/holidays are reference data every approved HR
-- user needs to see (to populate dropdowns) — widen read to any approved user
-- holding EMPLOYEE_VIEW as well.
do $$
declare t text;
begin
  foreach t in array array['departments','designations','shifts','holidays','leave_types'] loop
    execute format('drop policy if exists p_read on public.%I;', t);
    execute format($f$create policy p_read on public.%I for select to authenticated
      using (public.is_app_approved());$f$, t);
  end loop;
end $$;

-- employees: read if EMPLOYEE_VIEW (or own row); write if EMPLOYEE_EDIT/CREATE.
alter table public.employees enable row level security;
drop policy if exists emp_read on public.employees;
create policy emp_read on public.employees for select to authenticated
  using (
    public.is_hr_admin()
    or public.hr_has_permission('EMPLOYEE_VIEW')
    or lower(work_email) = public.hr_current_email()
    or lower(personal_email) = public.hr_current_email()
  );
drop policy if exists emp_write on public.employees;
create policy emp_write on public.employees for all to authenticated
  using (public.hr_has_permission('EMPLOYEE_EDIT') or public.hr_has_permission('EMPLOYEE_CREATE') or public.is_hr_admin())
  with check (public.hr_has_permission('EMPLOYEE_EDIT') or public.hr_has_permission('EMPLOYEE_CREATE') or public.is_hr_admin());

-- employee_status_history: read with EMPLOYEE_VIEW/self, write via EMPLOYEE_EDIT.
alter table public.employee_status_history enable row level security;
drop policy if exists esh_read on public.employee_status_history;
create policy esh_read on public.employee_status_history for select to authenticated
  using (public.hr_has_permission('EMPLOYEE_VIEW') or public.is_hr_admin()
         or employee_id = public.hr_current_employee_id());
drop policy if exists esh_write on public.employee_status_history;
create policy esh_write on public.employee_status_history for all to authenticated
  using (public.hr_has_permission('EMPLOYEE_EDIT') or public.is_hr_admin())
  with check (public.hr_has_permission('EMPLOYEE_EDIT') or public.is_hr_admin());

-- leave_balances: self can read own; HR with LEAVE_VIEW read all; write via LEAVE_APPROVE/HR.
alter table public.leave_balances enable row level security;
drop policy if exists lb_read on public.leave_balances;
create policy lb_read on public.leave_balances for select to authenticated
  using (public.hr_has_permission('LEAVE_VIEW') or public.is_hr_admin()
         or employee_id = public.hr_current_employee_id());
drop policy if exists lb_write on public.leave_balances;
create policy lb_write on public.leave_balances for all to authenticated
  using (public.hr_has_permission('LEAVE_APPROVE') or public.is_hr_admin())
  with check (public.hr_has_permission('LEAVE_APPROVE') or public.is_hr_admin());

-- leave_applications: self reads/creates own; approvers read via LEAVE_VIEW.
-- Most transitions go through RPCs, but a direct read/insert policy supports the
-- self-service apply path.
alter table public.leave_applications enable row level security;
drop policy if exists la_read on public.leave_applications;
create policy la_read on public.leave_applications for select to authenticated
  using (public.hr_has_permission('LEAVE_VIEW') or public.is_hr_admin()
         or employee_id = public.hr_current_employee_id());
drop policy if exists la_write on public.leave_applications;
create policy la_write on public.leave_applications for all to authenticated
  using (public.hr_has_permission('LEAVE_APPROVE') or public.is_hr_admin())
  with check (public.hr_has_permission('LEAVE_APPROVE') or public.is_hr_admin());

-- attendance: self reads own; ATTENDANCE_VIEW reads all; ATTENDANCE_EDIT writes.
alter table public.attendance enable row level security;
drop policy if exists att_read on public.attendance;
create policy att_read on public.attendance for select to authenticated
  using (public.hr_has_permission('ATTENDANCE_VIEW') or public.is_hr_admin()
         or employee_id = public.hr_current_employee_id());
drop policy if exists att_write on public.attendance;
create policy att_write on public.attendance for all to authenticated
  using (public.hr_has_permission('ATTENDANCE_EDIT') or public.is_hr_admin())
  with check (public.hr_has_permission('ATTENDANCE_EDIT') or public.is_hr_admin());

-- ---------------------------------------------------------------------------
-- 8. RPCs — atomic / rule-bearing operations
-- ---------------------------------------------------------------------------

-- Next employee code from hr_settings.data.employeeCode {prefix,padding,next}.
-- Advances the counter and returns the formatted code. HR write only.
create or replace function public.hr_next_employee_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb;
  prefix text;
  padding int;
  nextno bigint;
  code text;
begin
  if not (public.hr_has_permission('EMPLOYEE_CREATE') or public.is_hr_admin()) then
    raise exception 'Not authorized to create employees';
  end if;
  select data into cfg from public.hr_settings where id = 'singleton' for update;
  cfg := coalesce(cfg, '{}'::jsonb);
  prefix  := coalesce(cfg #>> '{employeeCode,prefix}', 'EMP-');
  padding := coalesce((cfg #>> '{employeeCode,padding}')::int, 6);
  nextno  := coalesce((cfg #>> '{employeeCode,next}')::bigint, 1);
  code := prefix || lpad(nextno::text, padding, '0');
  update public.hr_settings
    set data = jsonb_set(cfg, '{employeeCode,next}', to_jsonb(nextno + 1), true),
        updated_at = now()
    where id = 'singleton';
  return code;
end $$;

-- Apply for leave: validates dates + balance, writes the application and bumps
-- the `pending` balance in one transaction, notifies the manager.
create or replace function public.hr_apply_leave(
  p_employee_id text, p_leave_type_id text, p_start date, p_end date,
  p_is_half_day boolean default false, p_half_part text default null,
  p_days numeric default null, p_reason text default null, p_attachment_url text default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_emp record;
  v_type record;
  v_days numeric;
  v_year int := extract(year from p_start)::int;
  v_bal record;
  v_available numeric;
  v_app_id text;
  v_mgr_email text;
begin
  select * into v_emp from public.employees where id = p_employee_id;
  if v_emp is null then raise exception 'Unknown employee'; end if;
  -- Authorization: self-service, or a leave manager acting on behalf.
  if not (p_employee_id = public.hr_current_employee_id()
          or public.hr_has_permission('LEAVE_APPROVE') or public.is_hr_admin()) then
    raise exception 'Not authorized to apply leave for this employee';
  end if;
  if p_end < p_start then raise exception 'End date is before start date'; end if;
  select * into v_type from public.leave_types where id = p_leave_type_id;
  if v_type is null then raise exception 'Unknown leave type'; end if;

  v_days := coalesce(p_days,
    case when p_is_half_day then 0.5 else (p_end - p_start) + 1 end);
  if v_days <= 0 then raise exception 'Leave must be at least half a day'; end if;

  -- Overlap guard.
  if exists (
    select 1 from public.leave_applications la
    where la.employee_id = p_employee_id
      and la.status in ('submitted','manager_approved','approved')
      and daterange(la.start_date, la.end_date, '[]') && daterange(p_start, p_end, '[]')
  ) then
    raise exception 'Overlapping leave already exists for these dates';
  end if;

  -- Balance check (unless the type permits negative or is unpaid).
  select * into v_bal from public.leave_balances
    where employee_id = p_employee_id and leave_type_id = p_leave_type_id and year = v_year
    for update;
  if v_bal is null then
    insert into public.leave_balances (id, employee_id, leave_type_id, year, opening, accrued)
    values ('lbal_' || substr(md5(random()::text || clock_timestamp()::text),1,16),
            p_employee_id, p_leave_type_id, v_year, 0, v_type.annual_quota)
    returning * into v_bal;
  end if;
  v_available := v_bal.opening + v_bal.accrued + v_bal.adjusted - v_bal.used - v_bal.pending;
  if v_type.is_paid and not v_type.allow_negative and v_days > v_available then
    raise exception 'Insufficient leave balance (available %, requested %)', v_available, v_days;
  end if;

  v_app_id := 'lapp_' || substr(md5(random()::text || clock_timestamp()::text),1,16);
  insert into public.leave_applications
    (id, company_id, employee_id, leave_type_id, start_date, end_date, is_half_day,
     half_day_part, days, reason, attachment_url, status, manager_id)
  values
    (v_app_id, v_emp.company_id, p_employee_id, p_leave_type_id, p_start, p_end, p_is_half_day,
     p_half_part, v_days, p_reason, p_attachment_url, 'submitted', v_emp.reporting_manager_id);

  update public.leave_balances set pending = pending + v_days, updated_at = now()
    where id = v_bal.id;

  -- Notify manager (if their email is resolvable).
  select work_email into v_mgr_email from public.employees where id = v_emp.reporting_manager_id;
  if v_mgr_email is not null then
    perform public.hr_notify(v_mgr_email, 'leave.submitted', 'Leave request',
      coalesce(v_emp.display_name, v_emp.first_name) || ' requested ' || v_days || ' day(s) leave',
      'leave_application', v_app_id, '/app/hrm/leave');
  end if;

  perform public.hr_log('create', 'leave_application', v_app_id,
    'Leave applied (' || v_days || 'd)', null, to_jsonb(v_days), v_emp.company_id);
  return v_app_id;
end $$;

-- Approve / reject / cancel a leave application. Moves the days between pending
-- and used, notifies the employee. Concurrency-safe via row lock + status guard.
create or replace function public.hr_decide_leave(
  p_app_id text, p_decision text, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_app record;
  v_year int;
  v_emp record;
begin
  select * into v_app from public.leave_applications where id = p_app_id for update;
  if v_app is null then raise exception 'Unknown leave application'; end if;
  select * into v_emp from public.employees where id = v_app.employee_id;
  v_year := extract(year from v_app.start_date)::int;

  if p_decision = 'cancel' then
    if not (v_app.employee_id = public.hr_current_employee_id()
            or public.hr_has_permission('LEAVE_APPROVE') or public.is_hr_admin()) then
      raise exception 'Not authorized to cancel this leave';
    end if;
    if v_app.status not in ('submitted','manager_approved','approved') then
      raise exception 'Leave cannot be cancelled in status %', v_app.status;
    end if;
    -- Return the days: from pending (if not yet approved) or used (if approved).
    if v_app.status = 'approved' then
      update public.leave_balances set used = greatest(0, used - v_app.days), updated_at = now()
        where employee_id = v_app.employee_id and leave_type_id = v_app.leave_type_id and year = v_year;
    else
      update public.leave_balances set pending = greatest(0, pending - v_app.days), updated_at = now()
        where employee_id = v_app.employee_id and leave_type_id = v_app.leave_type_id and year = v_year;
    end if;
    update public.leave_applications
      set status = 'cancelled', decided_by = public.hr_current_email(), decided_at = now(),
          decision_note = p_note, updated_at = now()
      where id = p_app_id;
    perform public.hr_log('cancel', 'leave_application', p_app_id, 'Leave cancelled', null, null, v_app.company_id);
    return;
  end if;

  -- Approve / reject require the approval permission.
  if not (public.hr_has_permission('LEAVE_APPROVE') or public.is_hr_admin()) then
    raise exception 'Not authorized to approve or reject leave';
  end if;
  if v_app.status not in ('submitted','manager_approved') then
    raise exception 'Leave is not pending (status %)', v_app.status;
  end if;

  if p_decision = 'approve' then
    update public.leave_balances
      set pending = greatest(0, pending - v_app.days), used = used + v_app.days, updated_at = now()
      where employee_id = v_app.employee_id and leave_type_id = v_app.leave_type_id and year = v_year;
    update public.leave_applications
      set status = 'approved', decided_by = public.hr_current_email(), decided_at = now(),
          decision_note = p_note, updated_at = now()
      where id = p_app_id;
    if v_emp.work_email is not null then
      perform public.hr_notify(v_emp.work_email, 'leave.approved', 'Leave approved',
        'Your leave was approved', 'leave_application', p_app_id, '/app/hrm/leave');
    end if;
    perform public.hr_log('approve', 'leave_application', p_app_id, 'Leave approved', null, null, v_app.company_id);
  elsif p_decision = 'reject' then
    update public.leave_balances
      set pending = greatest(0, pending - v_app.days), updated_at = now()
      where employee_id = v_app.employee_id and leave_type_id = v_app.leave_type_id and year = v_year;
    update public.leave_applications
      set status = 'rejected', decided_by = public.hr_current_email(), decided_at = now(),
          decision_note = p_note, updated_at = now()
      where id = p_app_id;
    if v_emp.work_email is not null then
      perform public.hr_notify(v_emp.work_email, 'leave.rejected', 'Leave rejected',
        coalesce(p_note, 'Your leave was rejected'), 'leave_application', p_app_id, '/app/hrm/leave');
    end if;
    perform public.hr_log('reject', 'leave_application', p_app_id, 'Leave rejected', null, null, v_app.company_id);
  else
    raise exception 'Unknown decision %', p_decision;
  end if;
end $$;

-- Grants
grant execute on function public.hr_current_employee_id() to authenticated;
grant execute on function public.hr_next_employee_code() to authenticated;
grant execute on function public.hr_apply_leave(text,text,date,date,boolean,text,numeric,text,text) to authenticated;
grant execute on function public.hr_decide_leave(text,text,text) to authenticated;
