-- ============================================================================
-- 0027: Align HRM authorization with the app baseline (is_app_approved), the
-- same fix as finance (0026). The HR RBAC (0019-0021) gated everything on HR
-- permissions that no one has been assigned, locking approved users out of the
-- whole HRM module. This restores parity with the rest of the ERP. RBAC stays
-- available for future fine-grained control. Additive + idempotent.
-- notifications keeps its recipient-scoped policies; hr_audit_log stays
-- read-only for approved users (writes go through hr_log()).
-- ============================================================================

-- 1. Tables → single approved_all policy (drop every existing policy first, so
--    this is name-agnostic and repeatable).
do $$
declare t text; p record;
begin
  foreach t in array array['departments','designations','employees','employee_status_history','shifts','shift_assignments','holidays','leave_types','leave_balances','leave_applications','attendance','salary_components','salary_structures','salary_structure_lines','employee_salary','payroll_periods','payroll_runs','payroll_records','document_types','employee_documents','employee_assets','asset_assignments','employee_advances','advance_repayments','expense_categories','expense_claims','job_openings','candidates','interview_rounds','job_offers','performance_cycles','performance_reviews','performance_goals','training_programs','training_sessions','employee_training','hr_permissions','hr_roles','hr_role_permissions','hr_user_roles','hr_settings']
  loop
    execute format('alter table public.%I enable row level security;', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I;', p.policyname, t);
    end loop;
    execute format($f$create policy approved_all on public.%I for all to authenticated
      using (public.is_app_approved()) with check (public.is_app_approved());$f$, t);
  end loop;
end $$;

-- 2. hr_audit_log: readable by any approved user (still written only via hr_log).
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='hr_audit_log' loop
    execute format('drop policy if exists %I on public.hr_audit_log;', p.policyname);
  end loop;
  execute 'create policy hr_audit_read on public.hr_audit_log for select to authenticated using (public.is_app_approved())';
end $$;

-- 3. RPC guards → is_app_approved() (re-emitted verbatim with guard relaxed).
-- hr_next_employee_code
CREATE OR REPLACE FUNCTION public.hr_next_employee_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cfg jsonb;
  prefix text;
  padding int;
  nextno bigint;
  code text;
begin
  if not (public.is_app_approved()) then
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
end $function$
;

-- hr_apply_leave
CREATE OR REPLACE FUNCTION public.hr_apply_leave(p_employee_id text, p_leave_type_id text, p_start date, p_end date, p_is_half_day boolean DEFAULT false, p_half_part text DEFAULT NULL::text, p_days numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text, p_attachment_url text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          or public.is_app_approved()) then
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
end $function$
;

-- hr_decide_leave
CREATE OR REPLACE FUNCTION public.hr_decide_leave(p_app_id text, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            or public.is_app_approved()) then
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
  if not (public.is_app_approved()) then
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
end $function$
;

-- hr_run_payroll
CREATE OR REPLACE FUNCTION public.hr_run_payroll(p_period_id text, p_force boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not (public.is_app_approved()) then
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
end $function$
;

-- hr_finalize_payroll
CREATE OR REPLACE FUNCTION public.hr_finalize_payroll(p_period_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_period record;
begin
  if not (public.is_app_approved()) then
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
end $function$
;

-- hr_assign_role
CREATE OR REPLACE FUNCTION public.hr_assign_role(p_email text, p_role_key text, p_company_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role_id text;
begin
  if not public.is_app_approved() then raise exception 'Not authorized to assign roles'; end if;
  if coalesce(btrim(p_email), '') = '' then raise exception 'Email is required'; end if;
  select id into v_role_id from public.hr_roles where key = p_role_key;
  if v_role_id is null then raise exception 'Unknown role %', p_role_key; end if;
  insert into public.hr_user_roles (id, email, role_id, company_id, created_by)
  values ('hur_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
          lower(p_email), v_role_id, p_company_id, public.hr_current_email())
  on conflict (lower(email), role_id, coalesce(company_id, '*')) do nothing;
  perform public.hr_log('assign_role', 'hr_user_role', lower(p_email),
    'Assigned role ' || p_role_key, null,
    jsonb_build_object('role', p_role_key, 'company_id', p_company_id), p_company_id);
end;
$function$
;

-- hr_revoke_role
CREATE OR REPLACE FUNCTION public.hr_revoke_role(p_email text, p_role_key text, p_company_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role_id text;
begin
  if not public.is_app_approved() then raise exception 'Not authorized to revoke roles'; end if;
  select id into v_role_id from public.hr_roles where key = p_role_key;
  if v_role_id is null then raise exception 'Unknown role %', p_role_key; end if;
  delete from public.hr_user_roles
  where lower(email) = lower(p_email) and role_id = v_role_id
    and coalesce(company_id, '*') = coalesce(p_company_id, '*');
  perform public.hr_log('revoke_role', 'hr_user_role', lower(p_email),
    'Revoked role ' || p_role_key, null,
    jsonb_build_object('role', p_role_key, 'company_id', p_company_id), p_company_id);
end;
$function$
;
