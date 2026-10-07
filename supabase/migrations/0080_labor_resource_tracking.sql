-- ============================================================================
-- Production Planning — Operator / resource assignment + labor time tracking
-- ============================================================================
-- Phase 5 captured a single operator + one start→complete span per operation.
-- This adds real resource tracking: operators are HRM employees, and a labor
-- time LEDGER records every work session (who, which machine, which operation,
-- what activity, start→stop, minutes) — supporting multiple operators, pauses,
-- downtime, and a live "who is working now" view. QC inspectors use the same
-- employee link + ledger (activity = 'QC').
--
-- Model:
--   • job_operations.operator_employee_id / qc_inspections.inspector_employee_id
--     — FK to the HRM employees master (legacy free-text operator/inspector kept
--     for back-compat; new UI writes the FK).
--   • labor_time_logs — one row per work SESSION. Open (ended_at null) = running
--     now. Clock-out stamps ended_at + minutes. activity: Run/Setup/Idle/
--     Downtime/QC/Rework. At most ONE open session per employee (partial unique
--     index) so time is never double-counted.
--
-- Writes go only through labor_clock_in / labor_clock_out (SECURITY DEFINER,
-- prod_can-gated); end users get read-only RLS, matching the material-reservation
-- ledger (0074). Cross-tenant guards (0046 pattern) stop a log pointing at
-- another tenant's job/op/employee/machine.
--
-- Additive + idempotent. Reversible (drop table + columns + fns + perms).
-- Next free number after 0079.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Employee FKs on the existing production/QC records (additive)
-- ---------------------------------------------------------------------------
alter table public.job_operations
  add column if not exists operator_employee_id text references public.employees(id) on delete set null;
alter table public.qc_inspections
  add column if not exists inspector_employee_id text references public.employees(id) on delete set null;
create index if not exists idx_job_operations_operator_emp on public.job_operations (operator_employee_id);
create index if not exists idx_qc_inspections_inspector_emp on public.qc_inspections (inspector_employee_id);

-- ---------------------------------------------------------------------------
-- 2. labor_time_logs — the work-session ledger
-- ---------------------------------------------------------------------------
create table if not exists public.labor_time_logs (
  id               text primary key,
  job_id           text references public.job_orders(id) on delete cascade,
  job_operation_id text references public.job_operations(id) on delete set null,
  employee_id      text not null references public.employees(id) on delete restrict,
  machine_id       text references public.machines(id) on delete set null,
  activity         text not null default 'Run',  -- Run | Setup | Idle | Downtime | QC | Rework
  qc_inspection_id text references public.qc_inspections(id) on delete set null,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  minutes          numeric,                       -- stamped on clock-out
  downtime_reason  text,
  note             text,
  logged_by        text,                          -- who recorded (hr_current_email)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  tenant_id        text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_labor_logs_tenant   on public.labor_time_logs (tenant_id);
create index if not exists idx_labor_logs_job       on public.labor_time_logs (job_id);
create index if not exists idx_labor_logs_operation on public.labor_time_logs (job_operation_id);
create index if not exists idx_labor_logs_employee  on public.labor_time_logs (employee_id);
create index if not exists idx_labor_logs_open      on public.labor_time_logs (tenant_id) where ended_at is null;
-- At most one OPEN session per employee per tenant → no double-counted time.
create unique index if not exists uq_labor_open_per_employee
  on public.labor_time_logs (tenant_id, employee_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- 3. RLS — tenant read-only; writes only via the SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
alter table public.labor_time_logs enable row level security;
drop policy if exists labor_time_logs_read on public.labor_time_logs;
create policy labor_time_logs_read on public.labor_time_logs
  for select to authenticated using (public.has_tenant_access(tenant_id));

-- ---------------------------------------------------------------------------
-- 4. Cross-tenant reference guard (0046 pattern)
-- ---------------------------------------------------------------------------
create or replace function public.guard_xt_labor_time_logs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_orders',     new.job_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_operations', new.job_operation_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.employees',      new.employee_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.machines',       new.machine_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.qc_inspections', new.qc_inspection_id);
  return new;
end $$;
drop trigger if exists trg_xt_labor_time_logs on public.labor_time_logs;
create trigger trg_xt_labor_time_logs before insert or update on public.labor_time_logs
  for each row execute function public.guard_xt_labor_time_logs();

-- ---------------------------------------------------------------------------
-- 5. RPCs — clock in / clock out
-- ---------------------------------------------------------------------------
-- Start a work session for an employee. Derives job + default machine from the
-- operation when one is given. Rejects a second open session for the employee.
create or replace function public.labor_clock_in(
  p_id text,
  p_employee_id text,
  p_job_operation_id text default null,
  p_job_id text default null,
  p_machine_id text default null,
  p_activity text default 'Run',
  p_note text default null)
returns public.labor_time_logs
language plpgsql security definer set search_path = public as $$
declare
  op       public.job_operations;
  v_job    text := p_job_id;
  v_machine text := p_machine_id;
  v_ten    text;
  v_emp    public.employees;
  v_row    public.labor_time_logs;
begin
  if not public.prod_can('LABOR_LOG') then
    raise exception 'Not authorized to record labor time' using errcode = 'P0001';
  end if;
  if coalesce(p_activity,'') not in ('Run','Setup','Idle','Downtime','QC','Rework') then
    raise exception 'Invalid activity: %', p_activity using errcode = 'P0001';
  end if;

  select * into v_emp from public.employees where id = p_employee_id;
  if not found then raise exception 'Employee not found'; end if;
  if not public.has_tenant_access(v_emp.tenant_id) then
    raise exception 'Not authorized for this employee (tenant)';
  end if;
  v_ten := v_emp.tenant_id;

  if p_job_operation_id is not null then
    select * into op from public.job_operations where id = p_job_operation_id;
    if not found then raise exception 'Operation not found'; end if;
    v_job     := coalesce(v_job, op.job_id);
    v_machine := coalesce(v_machine, op.machine_id);
  end if;

  if exists (select 1 from public.labor_time_logs
             where employee_id = p_employee_id and tenant_id = v_ten and ended_at is null) then
    raise exception 'This operator already has an open work session — clock out first'
      using errcode = 'P0001';
  end if;

  insert into public.labor_time_logs (
    id, job_id, job_operation_id, employee_id, machine_id, activity,
    started_at, note, logged_by, tenant_id
  ) values (
    p_id, v_job, p_job_operation_id, p_employee_id, v_machine, p_activity,
    now(), p_note, public.hr_current_email(), v_ten
  ) returning * into v_row;

  perform public.hr_log('labor_clock_in', 'job_order', v_job,
    format('Clock-in: %s on %s (%s)', coalesce(v_emp.display_name, v_emp.first_name),
           coalesce(op.operation_name, 'job'), p_activity),
    null, to_jsonb(v_row), null, null);

  return v_row;
end $$;

-- Close an open work session: stamp ended_at + elapsed minutes.
create or replace function public.labor_clock_out(
  p_id text, p_note text default null, p_downtime_reason text default null)
returns public.labor_time_logs
language plpgsql security definer set search_path = public as $$
declare
  v_row public.labor_time_logs;
begin
  if not public.prod_can('LABOR_LOG') then
    raise exception 'Not authorized to record labor time' using errcode = 'P0001';
  end if;
  select * into v_row from public.labor_time_logs where id = p_id;
  if not found then raise exception 'Work session not found'; end if;
  if not public.has_tenant_access(v_row.tenant_id) then
    raise exception 'Not authorized for this session (tenant)';
  end if;
  if v_row.ended_at is not null then
    raise exception 'This work session is already closed' using errcode = 'P0001';
  end if;

  update public.labor_time_logs
     set ended_at        = now(),
         minutes         = round(extract(epoch from (now() - started_at)) / 60.0, 2),
         note            = coalesce(p_note, note),
         downtime_reason = coalesce(p_downtime_reason, downtime_reason),
         updated_at      = now()
   where id = p_id
   returning * into v_row;

  perform public.hr_log('labor_clock_out', 'job_order', v_row.job_id,
    format('Clock-out: %s min', v_row.minutes), null, to_jsonb(v_row), null, null);

  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RBAC — labor-logging + resource-assignment permissions
-- ---------------------------------------------------------------------------
insert into public.hr_permissions (key, module, label, description, sort) values
  ('LABOR_LOG',      'Production', 'Log labor time',    'Clock operators/inspectors in and out of work sessions', 322),
  ('RESOURCE_ASSIGN','Production', 'Assign resources',  'Assign operators and machines to operations',            323)
on conflict (key) do nothing;

-- LABOR_LOG → the broad shop set (operators, inspectors, managers).
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_admin', key, 'all' from public.hr_permissions
  where key in ('LABOR_LOG','RESOURCE_ASSIGN') on conflict do nothing;
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_manager', key, 'company' from public.hr_permissions
  where key in ('LABOR_LOG','RESOURCE_ASSIGN') on conflict do nothing;
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_prod_manager', key, 'company' from public.hr_permissions
  where key in ('LABOR_LOG','RESOURCE_ASSIGN') on conflict do nothing;
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_prod_operator', 'LABOR_LOG', 'team' on conflict do nothing;
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_qc_inspector', 'LABOR_LOG', 'company' on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.labor_clock_in(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.labor_clock_out(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (reversible):
--   drop function if exists public.labor_clock_out(text, text, text);
--   drop function if exists public.labor_clock_in(text, text, text, text, text, text, text);
--   drop function if exists public.guard_xt_labor_time_logs();
--   drop table if exists public.labor_time_logs;
--   alter table public.job_operations  drop column if exists operator_employee_id;
--   alter table public.qc_inspections  drop column if exists inspector_employee_id;
--   delete from public.hr_role_permissions where permission_key in ('LABOR_LOG','RESOURCE_ASSIGN');
--   delete from public.hr_permissions where key in ('LABOR_LOG','RESOURCE_ASSIGN');
-- ============================================================================
