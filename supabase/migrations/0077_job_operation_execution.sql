-- ============================================================================
-- Production Planning — Phase 5: Per-operation execution
-- ============================================================================
-- Phase 4 (0075) gave each production order an operation sequence
-- (job_operations) but left it plan/display only — status defaulted to
-- 'Planned' and there was no way to actually RUN an operation on the shop
-- floor. This migration adds the missing execution layer: start / complete /
-- skip an operation, capturing WHO ran it, WHEN it started and finished, how
-- many pieces were done, and the actual minutes spent.
--
-- Model:
--   • Execution is recorded IN PLACE on job_operations (new columns below) —
--     an operation is a single run, not a ledger, so there is no separate
--     movement table. The operation's status is the source of truth:
--     Planned → In Progress → Completed (or → Skipped).
--   • actual_minutes is captured on completion: the caller may pass an explicit
--     value, otherwise it is derived from started_at → now().
--
-- Rules (all enforced server-side in the RPCs below, mirroring transition_job):
--   • PRODUCTION_EXECUTE permission (reused — no new RBAC rows), via prod_can()
--     so single-admin / unconfigured tenants keep working.
--   • The parent order must be In Progress to start an operation (production has
--     actually begun), matching the job-level lifecycle.
--   • Sequential routing: an operation cannot start until every earlier-seq
--     operation on the same order is Completed or Skipped.
--   • State machine: only Planned/In Progress ops can start or complete; a
--     Completed/Skipped op is terminal. Skipping requires the op be unfinished.
--
-- The QC / finished-goods / dispatch RPCs (qc_record_inspection, fg_receive,
-- fg_dispatch, transition_job) were audited for this phase and already enforce
-- their quantity, balance and authorization invariants server-side, so this
-- migration adds the previously-missing execution rules rather than touching
-- that already-hardened code.
--
-- Additive + idempotent (add column if not exists / create or replace).
-- Reversible: drop the new columns + functions (see ROLLBACK note at foot).
-- Next free number after 0076.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Execution columns on job_operations
-- ---------------------------------------------------------------------------
alter table public.job_operations
  add column if not exists started_at     timestamptz,
  add column if not exists completed_at   timestamptz,
  add column if not exists operator       text,
  add column if not exists qty_completed  numeric not null default 0,
  add column if not exists actual_minutes numeric;

-- ---------------------------------------------------------------------------
-- 2. Internal guard — shared start/complete validation
-- ---------------------------------------------------------------------------
-- Loads the operation + its parent order, enforces tenant access and the
-- PRODUCTION_EXECUTE permission, and returns the parent job row. Raises on any
-- failure. Kept SECURITY DEFINER so prod_can()/has_tenant_access see the full
-- picture regardless of the caller's direct table grants.
create or replace function public.job_operation_guard(p_id text)
returns public.job_orders
language plpgsql security definer set search_path = public as $$
declare
  op public.job_operations;
  j  public.job_orders;
begin
  select * into op from public.job_operations where id = p_id;
  if not found then raise exception 'Operation not found'; end if;
  select * into j from public.job_orders where id = op.job_id;
  if not found then raise exception 'Production order not found'; end if;
  if not public.has_tenant_access(j.tenant_id) then
    raise exception 'Not authorized for this operation (tenant)';
  end if;
  if not public.prod_can('PRODUCTION_EXECUTE') then
    raise exception 'Not authorized to execute production operations' using errcode = 'P0001';
  end if;
  return j;
end $$;

-- ---------------------------------------------------------------------------
-- 3. job_operation_start — begin an operation on the floor
-- ---------------------------------------------------------------------------
create or replace function public.job_operation_start(
  p_id text, p_operator text default null)
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
     set status     = 'In Progress',
         started_at = coalesce(started_at, now()),
         operator   = coalesce(p_operator, operator, public.hr_current_email()),
         updated_at = now()
   where id = p_id
   returning * into op;

  perform public.hr_log('job_operation_start', 'job_order', op.job_id,
    format('Started operation %s (%s)', op.seq, coalesce(op.operation_name, 'op')),
    null, to_jsonb(op), j.company_id, null);

  return op;
end $$;

-- ---------------------------------------------------------------------------
-- 4. job_operation_complete — finish an operation, capture qty + time
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
         started_at     = coalesce(started_at, now()),  -- quick-complete without an explicit start
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

  return op;
end $$;

-- ---------------------------------------------------------------------------
-- 5. job_operation_skip — mark an operation not required for this order
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

  return op;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.job_operation_guard(text)                      to authenticated;
grant execute on function public.job_operation_start(text, text)                to authenticated;
grant execute on function public.job_operation_complete(text, numeric, numeric, text) to authenticated;
grant execute on function public.job_operation_skip(text, text)                 to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (reversible, non-destructive):
--   drop function if exists public.job_operation_skip(text, text);
--   drop function if exists public.job_operation_complete(text, numeric, numeric, text);
--   drop function if exists public.job_operation_start(text, text);
--   drop function if exists public.job_operation_guard(text);
--   alter table public.job_operations
--     drop column if exists started_at, drop column if exists completed_at,
--     drop column if exists operator, drop column if exists qty_completed,
--     drop column if exists actual_minutes;
-- ============================================================================
