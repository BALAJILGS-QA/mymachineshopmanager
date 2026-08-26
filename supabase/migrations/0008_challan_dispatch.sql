-- ============================================================================
-- Inventory redesign - Phase 1b: delivery-challan inventory (deduct on create)
-- ============================================================================
-- create_challan_with_dispatch: validates + advisory-locks + stock-checks EVERY
-- line first, then creates the challan and one stock-out issue per line in one
-- transaction (all-or-nothing). Idempotency is guaranteed by the unique index on
-- (reference_type, reference_id, material_id). cancel_challan reverses with
-- compensating adjustments (originals preserved for audit). dc_guard blocks
-- editing/deleting a dispatched challan. create_material_issue gains the same
-- advisory lock so manual issues are race-safe too.
--
-- Line shape (jsonb): { id, materialId, ownerType('Company'|'Shop'), quantity,
-- unit, description?, jobId? }. ownerType Company -> that customer's stock;
-- Shop -> own stock.  SECURITY INVOKER. Idempotent. Additive.
-- ============================================================================

create or replace function public.create_challan_with_dispatch(
  p_id text, p_dc_no text, p_date date, p_company_id text, p_job_id text,
  p_reference text, p_vehicle_no text, p_notes text, p_lines jsonb
) returns setof public.delivery_challans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allow_neg boolean;
  v_line      jsonb;
  v_idx       int := 0;
  v_mat_id    text;
  v_owner     text;
  v_scope     text;
  v_qty       numeric;
  v_unit      text;
  v_line_job  text;
  v_available numeric;
  v_mat_name  text;
  v_mat_unit  text;
begin
  if not exists (select 1 from companies where id = p_company_id) then
    raise exception 'Select a valid company';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from app_state where id = 'singleton';

  -- Pass 1: validate + lock + stock-check every line before touching anything.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_mat_id := v_line ->> 'materialId';
    v_owner  := coalesce(v_line ->> 'ownerType', 'Company');
    v_qty    := (v_line ->> 'quantity')::numeric;
    if v_mat_id is null or v_mat_id = '' then
      raise exception 'Every challan line must have a material';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Item quantity must be greater than zero';
    end if;
    select name, unit into v_mat_name, v_mat_unit from materials where id = v_mat_id;
    if not found then raise exception 'Select a valid material'; end if;
    v_scope := case when v_owner = 'Company' then p_company_id else null end;
    perform pg_advisory_xact_lock(hashtext(v_mat_id || ':' || coalesce(v_scope, 'shop')));
    v_available := public.material_balance(v_mat_id, v_scope);
    if not v_allow_neg and v_qty > v_available then
      raise exception 'Insufficient stock for "%": available % %, requested %.',
        v_mat_name, v_available, v_mat_unit, v_qty;
    end if;
  end loop;

  insert into delivery_challans (id, dc_no, date, company_id, job_id, reference, vehicle_no, lines, notes, status)
  values (p_id, p_dc_no, p_date, p_company_id, p_job_id, p_reference, p_vehicle_no, p_lines, p_notes, 'Open');

  -- Pass 2: post one stock-out issue per line.
  v_idx := 0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_mat_id   := v_line ->> 'materialId';
    v_owner    := coalesce(v_line ->> 'ownerType', 'Company');
    v_qty      := (v_line ->> 'quantity')::numeric;
    v_unit     := coalesce(v_line ->> 'unit', 'Nos');
    v_line_job := nullif(v_line ->> 'jobId', '');
    v_scope    := case when v_owner = 'Company' then p_company_id else null end;
    insert into material_issues (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note, reference_type, reference_id)
    values (p_id || '_iss_' || v_idx, p_dc_no || '/' || v_idx, p_date, v_mat_id,
            coalesce(v_line_job, p_job_id), v_scope, v_qty, v_unit,
            'Dispatched via challan ' || p_dc_no, 'DELIVERY_CHALLAN', p_id);
    v_idx := v_idx + 1;
  end loop;

  return query select * from delivery_challans where id = p_id;
end;
$$;

create or replace function public.cancel_challan(p_id text)
returns setof public.delivery_challans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_dc_no  text;
  r        record;
begin
  select status, dc_no into v_status, v_dc_no from delivery_challans where id = p_id;
  if not found then raise exception 'Delivery challan not found'; end if;

  if v_status <> 'Cancelled' then
    -- Reverse each dispatch issue with a compensating +qty adjustment (originals
    -- stay for audit; net balance returns to what it was).
    for r in select * from material_issues
             where reference_type = 'DELIVERY_CHALLAN' and reference_id = p_id loop
      insert into stock_adjustments (id, adj_no, date, material_id, company_id, quantity, unit, reason)
      values (p_id || '_rev_' || r.id, 'REV/' || r.issue_no, current_date, r.material_id,
              r.company_id, r.quantity, r.unit, 'Reversal: challan ' || v_dc_no || ' cancelled')
      on conflict (id) do nothing;
    end loop;
    update delivery_challans set status = 'Cancelled', updated_at = now() where id = p_id;
  end if;

  return query select * from delivery_challans where id = p_id;
end;
$$;

-- Guard: a dispatched (or invoiced) challan cannot have its items edited or be
-- deleted - it must be cancelled (which reverses inventory).
create or replace function public.dc_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_dispatched boolean;
begin
  if TG_OP = 'DELETE' then
    if old.status = 'Invoiced' then
      raise exception 'Challan is invoiced. Cancel it instead of deleting.';
    end if;
    if exists (select 1 from material_issues where reference_type = 'DELIVERY_CHALLAN' and reference_id = old.id) then
      raise exception 'Challan has dispatched stock. Cancel it (reverses inventory) instead of deleting.';
    end if;
    return old;
  end if;
  v_dispatched := exists (select 1 from material_issues where reference_type = 'DELIVERY_CHALLAN' and reference_id = old.id);
  if (old.status = 'Invoiced' or v_dispatched) and new.lines is distinct from old.lines then
    raise exception 'Cannot edit items on a dispatched or invoiced challan';
  end if;
  return new;
end;
$$;

-- Make the manual material issue race-safe too (advisory lock before the check).
create or replace function public.create_material_issue(
  p_id text, p_issue_no text, p_date date, p_material_id text, p_job_id text,
  p_company_id text, p_quantity numeric, p_unit text, p_note text,
  p_override boolean default false
) returns setof public.material_issues
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_available numeric;
  v_allow_neg boolean;
begin
  if p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_material_id || ':' || coalesce(p_company_id, 'shop')));
  v_available := public.material_balance(p_material_id, p_company_id);
  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from public.app_state where id = 'singleton';
  if not coalesce(v_allow_neg, false) and not coalesce(p_override, false)
     and p_quantity > v_available then
    raise exception 'Only % in stock for this material. Enable override to issue anyway.', v_available;
  end if;
  return query
  insert into public.material_issues (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note)
  values (p_id, p_issue_no, p_date, p_material_id, p_job_id, p_company_id, p_quantity, p_unit, p_note)
  returning *;
end;
$$;

grant execute on function public.create_challan_with_dispatch(text, text, date, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.cancel_challan(text) to authenticated;
