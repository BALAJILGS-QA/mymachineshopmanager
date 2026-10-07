-- ============================================================================
-- Production Planning — Operation → Order completion rollup
-- ============================================================================
-- Phase 5 added per-operation execution (job_operation_start/complete/skip) but
-- finishing the last operation did NOT advance the order — a supervisor still
-- had to click "Complete production" separately. This closes that gap: when the
-- last operation on an order reaches a terminal state (Completed/Skipped) and at
-- least one was actually Completed, the order auto-advances In Progress →
-- Completed.
--
-- Separation of duties is preserved by reusing transition_job():
--   • The rollup runs ONLY when the acting user prod_can('PRODUCTION_COMPLETE').
--     A pure operator (PRODUCTION_EXECUTE only) finishes the operations and the
--     order waits In Progress for a supervisor to complete it — exactly the
--     existing RBAC intent. Bootstrap installs (no roles) auto-complete.
--   • transition_job() enforces the status matrix + authorization + writes the
--     production_events row and completed_qty, so there is no parallel logic.
--
-- Guards: only from status 'In Progress'; only when an operation plan exists and
-- every op is terminal; never when everything was skipped (nothing produced).
-- The produced quantity is taken from the highest-seq Completed operation (the
-- finished-pieces proxy for a linear routing), clamped so it can never trip
-- transition_job's overproduction check (null → transition_job defaults it).
--
-- Idempotent (create or replace). Reversible: restore the Phase-5 (0077) bodies
-- of job_operation_complete/skip and drop job_maybe_complete_from_ops.
-- Next free number after 0077.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Shared rollup — advance the order when its operations are all done
-- ---------------------------------------------------------------------------
create or replace function public.job_maybe_complete_from_ops(p_job_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  j          public.job_orders;
  v_total    integer;
  v_open     integer;
  v_completed integer;
  v_qty      numeric;
  v_evt      text;
begin
  select * into j from public.job_orders where id = p_job_id;
  if not found then return; end if;
  if j.status <> 'In Progress' then return; end if;        -- only from active production
  if not public.prod_can('PRODUCTION_COMPLETE') then return; end if;  -- separation of duties

  select count(*),
         count(*) filter (where status not in ('Completed', 'Skipped')),
         count(*) filter (where status = 'Completed')
    into v_total, v_open, v_completed
    from public.job_operations where job_id = p_job_id;

  if v_total = 0 then return; end if;       -- no operation plan → stay manual
  if v_open > 0 then return; end if;        -- work still outstanding
  if v_completed = 0 then return; end if;   -- everything skipped → don't auto-complete

  -- Finished-pieces proxy: the last completed operation's output quantity.
  select qty_completed into v_qty
    from public.job_operations
   where job_id = p_job_id and status = 'Completed' and coalesce(qty_completed, 0) > 0
   order by seq desc
   limit 1;
  -- Clamp: never exceed ordered (would trip transition_job overproduction);
  -- null lets transition_job apply its own default (0 → ordered_qty).
  if v_qty is not null and v_qty > j.ordered_qty then v_qty := null; end if;
  if coalesce(v_qty, 0) <= 0 then v_qty := null; end if;

  v_evt := 'evt_' || left(replace(gen_random_uuid()::text, '-', ''), 20);
  perform public.transition_job(
    p_job_id, 'Completed'::job_status, v_evt,
    v_qty, null, 'Auto-completed: all operations finished', j.operator);
end $$;

-- ---------------------------------------------------------------------------
-- 2. job_operation_complete — same as 0077 + rollup at the end
-- ---------------------------------------------------------------------------
create or replace function public.job_operation_complete(
  p_id text, p_qty numeric default null, p_actual_min numeric default null,
  p_note text default null)
returns public.job_operations
language plpgsql security definer set search_path = public as $$
declare
  op public.job_operations;
  j  public.job_orders;
begin
  j  := public.job_operation_guard(p_id);
  select * into op from public.job_operations where id = p_id;

  if op.status = 'Completed' then raise exception 'Operation is already completed' using errcode = 'P0001'; end if;
  if op.status = 'Skipped'   then raise exception 'Operation was skipped' using errcode = 'P0001'; end if;
  if p_qty is not null and p_qty < 0 then raise exception 'Completed quantity cannot be negative'; end if;
  if p_actual_min is not null and p_actual_min < 0 then raise exception 'Actual minutes cannot be negative'; end if;

  update public.job_operations
     set status         = 'Completed',
         started_at     = coalesce(started_at, now()),
         completed_at   = now(),
         qty_completed  = coalesce(p_qty, qty_completed),
         actual_minutes = coalesce(
                            p_actual_min,
                            round(extract(epoch from (now() - coalesce(started_at, now()))) / 60.0, 2)),
         operator       = coalesce(operator, public.hr_current_email()),
         notes          = coalesce(p_note, notes),
         updated_at     = now()
   where id = p_id
   returning * into op;

  perform public.hr_log('job_operation_complete', 'job_order', op.job_id,
    format('Completed operation %s (%s): qty %s, %s min',
           op.seq, coalesce(op.operation_name, 'op'), op.qty_completed, op.actual_minutes),
    null, to_jsonb(op), j.company_id, null);

  -- Roll up to the order if this finished the last operation.
  perform public.job_maybe_complete_from_ops(op.job_id);

  return op;
end $$;

-- ---------------------------------------------------------------------------
-- 3. job_operation_skip — same as 0077 + rollup at the end
-- ---------------------------------------------------------------------------
create or replace function public.job_operation_skip(
  p_id text, p_note text default null)
returns public.job_operations
language plpgsql security definer set search_path = public as $$
declare
  op public.job_operations;
  j  public.job_orders;
begin
  j  := public.job_operation_guard(p_id);
  select * into op from public.job_operations where id = p_id;

  if op.status = 'Completed' then raise exception 'A completed operation cannot be skipped' using errcode = 'P0001'; end if;

  update public.job_operations
     set status     = 'Skipped',
         notes      = coalesce(p_note, notes),
         updated_at = now()
   where id = p_id
   returning * into op;

  perform public.hr_log('job_operation_skip', 'job_order', op.job_id,
    format('Skipped operation %s (%s)', op.seq, coalesce(op.operation_name, 'op')),
    null, to_jsonb(op), j.company_id, null);

  -- Skipping the last outstanding operation can also complete the order.
  perform public.job_maybe_complete_from_ops(op.job_id);

  return op;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Grant
-- ---------------------------------------------------------------------------
grant execute on function public.job_maybe_complete_from_ops(text) to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (reversible):
--   Re-apply migration 0077's bodies of job_operation_complete/skip (identical
--   minus the `perform public.job_maybe_complete_from_ops(...)` line), then
--   drop function if exists public.job_maybe_complete_from_ops(text);
-- ============================================================================
