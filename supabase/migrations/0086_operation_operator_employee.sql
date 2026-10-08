-- ============================================================================
-- Production Planning — operation operator as an HRM employee (HRM-C)
-- ============================================================================
-- Extends job_operation_start with an optional trailing p_operator_employee_id
-- so starting an operation can record the ASSIGNED operator as the HRM employee
-- FK (job_operations.operator_employee_id, added in 0080) alongside the existing
-- free-text operator name. Everything else is byte-identical to the live 0077
-- function — the new parameter has a default, so existing callers are unaffected.
--
-- This "assigned operator" is distinct from WHO ACTUALLY ran time on the op,
-- which is captured separately through the labor ledger (labor_time_logs, 0080)
-- via the Shop Floor board. Both are kept on purpose.
--
-- Idempotent (create or replace). Reversible: re-create the function without the
-- trailing parameter (restore the 0077 body). Next free number after 0085.
-- ============================================================================

-- Adding a trailing parameter creates an OVERLOAD, not a replacement — drop the
-- original 2-arg 0077 signature so PostgREST has a single unambiguous function.
drop function if exists public.job_operation_start(text, text);

create or replace function public.job_operation_start(
  p_id text, p_operator text default null, p_operator_employee_id text default null)
returns public.job_operations
language plpgsql security definer set search_path = public as $$
declare
  op       public.job_operations;
  j        public.job_orders;
  v_open   integer;
begin
  j  := public.job_operation_guard(p_id);
  select * into op from public.job_operations where id = p_id;

  if j.status <> 'In Progress' then
    raise exception 'Start production on the order before running its operations (order status: %)', j.status
      using errcode = 'P0001';
  end if;
  if op.status = 'Completed' then raise exception 'Operation is already completed' using errcode = 'P0001'; end if;
  if op.status = 'Skipped'   then raise exception 'Operation was skipped' using errcode = 'P0001'; end if;

  -- Sequential routing: all earlier-seq operations must be finished (done or skipped).
  select count(*) into v_open
    from public.job_operations
   where job_id = op.job_id and seq < op.seq and status not in ('Completed', 'Skipped');
  if v_open > 0 then
    raise exception 'Earlier operations must be completed or skipped first (% pending)', v_open
      using errcode = 'P0001';
  end if;

  update public.job_operations
     set status               = 'In Progress',
         started_at           = coalesce(started_at, now()),
         operator             = coalesce(p_operator, operator, public.hr_current_email()),
         operator_employee_id = coalesce(p_operator_employee_id, operator_employee_id),
         updated_at           = now()
   where id = p_id
   returning * into op;

  perform public.hr_log('job_operation_start', 'job_order', op.job_id,
    format('Started operation %s (%s)', op.seq, coalesce(op.operation_name, 'op')),
    null, to_jsonb(op), j.company_id, null);

  return op;
end $$;

grant execute on function public.job_operation_start(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (reversible, non-destructive):
--   drop function if exists public.job_operation_start(text, text, text);
--   -- then re-run the 0077 definition to restore the 2-arg signature + grant.
-- ============================================================================
