-- ============================================================================
-- Phase 6 - Job RPCs: create (with material auto-issue) + production transition
-- ============================================================================
-- Ports jobRepo.create and jobRepo.transition from src/data/repo.ts. Doc numbers
-- (job_no, issue_no, event id) are client-formatted and passed in. SECURITY
-- INVOKER so RLS still gates. Atomic: a job that consumes material inserts the
-- job + the auto-issue in one transaction (or fails wholesale on a shortfall).
-- Idempotent. Additive. No DROP/TRUNCATE.
-- ============================================================================

create or replace function public.create_job(
  p_id text, p_job_no text, p_company_id text, p_customer_po text,
  p_part_name text, p_part_number text, p_material_id text,
  p_ordered_qty numeric, p_completed_qty numeric, p_rate numeric,
  p_order_date date, p_due_date date, p_priority job_priority, p_status job_status,
  p_notes text,
  p_material_qty numeric default 0, p_material_owner text default 'Shop',
  p_issue_id text default null, p_issue_no text default null
) returns setof public.job_orders
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allow_over boolean;
  v_allow_neg  boolean;
  v_consume    numeric := coalesce(p_material_qty, 0);
  v_from_cust  boolean := (p_material_owner = 'Company');
  v_scope      text;
  v_available  numeric;
  v_unit       text;
  v_name       text;
  v_where      text;
begin
  if btrim(coalesce(p_part_name, '')) = '' then
    raise exception 'Part name is required';
  end if;
  if p_ordered_qty <= 0 then
    raise exception 'Ordered quantity must be greater than zero';
  end if;
  if coalesce(p_completed_qty, 0) < 0 then
    raise exception 'Completed quantity cannot be negative';
  end if;

  select coalesce((data -> 'settings' ->> 'allowOverproduction')::boolean, false),
         coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_over, v_allow_neg from public.app_state where id = 'singleton';

  if not v_allow_over and coalesce(p_completed_qty, 0) > p_ordered_qty then
    raise exception 'Completed quantity cannot exceed ordered quantity';
  end if;

  v_scope := case when v_from_cust then p_company_id else null end; -- null = shop

  if v_consume > 0 then
    select unit, name into v_unit, v_name from public.materials where id = p_material_id;
    if not found then
      raise exception 'Select a valid material to consume';
    end if;
    v_available := public.material_balance(p_material_id, v_scope);
    v_where := case when v_from_cust then 'this customer''s' else 'own (shop)' end;
    if not v_allow_neg and v_consume > v_available then
      raise exception 'Only % % of "%" in % stock - cannot create a job consuming %.',
        v_available, v_unit, v_name, v_where, v_consume;
    end if;
  end if;

  insert into public.job_orders (id, job_no, company_id, customer_po, part_name, part_number,
    material_id, ordered_qty, completed_qty, rate, order_date, due_date, priority, status, notes)
  values (p_id, p_job_no, p_company_id, p_customer_po, btrim(p_part_name), p_part_number,
    p_material_id, p_ordered_qty, coalesce(p_completed_qty, 0), p_rate, p_order_date, p_due_date,
    p_priority, p_status, p_notes);

  if v_consume > 0 then
    insert into public.material_issues (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note)
    values (p_issue_id, p_issue_no, p_order_date, p_material_id, p_id,
      case when v_from_cust then p_company_id else null end, v_consume, v_unit,
      'Auto-issued on creation of job ' || p_job_no || ' (' ||
        (case when v_from_cust then 'customer' else 'own' end) || ' stock)');
  end if;

  return query select * from public.job_orders where id = p_id;
end;
$$;

create or replace function public.transition_job(
  p_id text, p_to job_status, p_event_id text,
  p_completed_qty numeric default null, p_rejected_qty numeric default null,
  p_note text default null, p_operator text default null
) returns setof public.job_orders
language plpgsql
security invoker
set search_path = public
as $$
declare
  j            public.job_orders;
  v_from       job_status;
  v_allow_over boolean;
  v_type       text;
begin
  select * into j from public.job_orders where id = p_id;
  if not found then
    raise exception 'Job order not found';
  end if;
  v_from := j.status;

  select coalesce((data -> 'settings' ->> 'allowOverproduction')::boolean, false)
    into v_allow_over from public.app_state where id = 'singleton';

  if p_completed_qty is not null then
    if p_completed_qty < 0 then
      raise exception 'Completed quantity cannot be negative';
    end if;
    if not v_allow_over and p_completed_qty > j.ordered_qty then
      raise exception 'Completed quantity cannot exceed ordered quantity';
    end if;
    j.completed_qty := p_completed_qty;
  end if;

  if p_to = 'In Progress' and j.started_at is null then
    j.started_at := now();
    if p_operator is not null then j.operator := p_operator; end if;
  end if;
  if p_to = 'Completed' then
    j.completed_at := now();
    if j.completed_qty = 0 then j.completed_qty := j.ordered_qty; end if;
    if p_rejected_qty is not null then
      if p_rejected_qty < 0 then
        raise exception 'Rejected quantity cannot be negative';
      end if;
      if p_rejected_qty > j.completed_qty then
        raise exception 'Rejected quantity cannot exceed completed quantity';
      end if;
      j.rejected_qty := p_rejected_qty;
    end if;
  end if;
  if p_to = 'Delivered' then
    j.delivered_at := now();
    if j.completed_at is null then j.completed_at := now(); end if;
  end if;

  update public.job_orders set
    status = p_to, completed_qty = j.completed_qty, rejected_qty = j.rejected_qty,
    started_at = j.started_at, completed_at = j.completed_at, delivered_at = j.delivered_at,
    operator = j.operator, updated_at = now()
  where id = p_id;

  v_type := case p_to
    when 'In Progress' then 'Start' when 'On Hold' then 'Hold'
    when 'Completed' then 'Complete' when 'Delivered' then 'Deliver' else 'Status' end;

  insert into public.production_events (id, job_id, type, from_status, to_status, completed_qty, note, operator, at)
  values (p_event_id, p_id, v_type, v_from, p_to, p_completed_qty, p_note, p_operator, now());

  return query select * from public.job_orders where id = p_id;
end;
$$;

grant execute on function public.create_job(text, text, text, text, text, text, text, numeric, numeric, numeric, date, date, job_priority, job_status, text, numeric, text, text, text) to authenticated;
grant execute on function public.transition_job(text, job_status, text, numeric, numeric, text, text) to authenticated;
