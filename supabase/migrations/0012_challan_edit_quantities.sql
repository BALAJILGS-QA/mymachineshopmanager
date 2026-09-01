-- ============================================================================
-- Delivery challan: edit line quantities after dispatch (stock re-synced)
-- ============================================================================
-- An Open challan's dispatched quantities can now be corrected in place. Each
-- challan line maps 1:1 to a material_issue (the (reference_type, reference_id,
-- material_id) unique index guarantees one issue per material), so re-syncing
-- stock is just updating that issue's quantity - the balance view recomputes.
--
-- dc_guard normally blocks any line change on a dispatched challan; it now yields
-- when the transaction-local flag app.allow_dc_line_edit = '1' is set, which only
-- update_challan_quantities does. Materials can't be added/removed here (that
-- still needs cancel + recreate) and invoiced/cancelled challans are rejected.
-- Increases are stock-checked (honouring settings.allowNegativeStock). Additive.
-- ============================================================================

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
  -- The quantity-edit RPC re-syncs the linked issues itself, so it is allowed to
  -- change lines even on a dispatched challan (flagged via a tx-local setting).
  if (old.status = 'Invoiced' or v_dispatched)
     and new.lines is distinct from old.lines
     and coalesce(current_setting('app.allow_dc_line_edit', true), '') <> '1' then
    raise exception 'Cannot edit items on a dispatched or invoiced challan';
  end if;
  return new;
end;
$$;

create or replace function public.update_challan_quantities(
  p_id text, p_reference text, p_vehicle_no text, p_notes text, p_lines jsonb
) returns setof public.delivery_challans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status    text;
  v_dc_no     text;
  v_allow_neg boolean;
  v_line      jsonb;
  v_mat_id    text;
  v_owner     text;
  v_scope     text;
  v_new_qty   numeric;
  v_old_qty   numeric;
  v_issue_id  text;
  v_available numeric;
  v_mat_name  text;
  v_mat_unit  text;
begin
  select status, dc_no into v_status, v_dc_no from delivery_challans where id = p_id;
  if not found then raise exception 'Delivery challan not found'; end if;
  if v_status <> 'Open' then
    raise exception 'Only an open (un-invoiced) challan''s quantities can be edited.';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from app_state where id = 'singleton';

  -- Allow this transaction to rewrite the (dispatched) challan's lines.
  perform set_config('app.allow_dc_line_edit', '1', true);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_mat_id  := v_line ->> 'materialId';
    v_owner   := coalesce(v_line ->> 'ownerType', 'Company');
    v_new_qty := (v_line ->> 'quantity')::numeric;
    if v_mat_id is null or v_mat_id = '' then
      raise exception 'Every challan line must have a material';
    end if;
    if v_new_qty is null or v_new_qty <= 0 then
      raise exception 'Item quantity must be greater than zero';
    end if;
    v_scope := case when v_owner = 'Company' then (select company_id from delivery_challans where id = p_id) else null end;

    select id, quantity into v_issue_id, v_old_qty
      from material_issues
      where reference_type = 'DELIVERY_CHALLAN' and reference_id = p_id and material_id = v_mat_id;
    if not found then
      raise exception 'Items can only have their quantity changed. To add or remove a material, cancel this challan and create a new one.';
    end if;

    if v_new_qty > v_old_qty then
      select name, unit into v_mat_name, v_mat_unit from materials where id = v_mat_id;
      perform pg_advisory_xact_lock(hashtext(v_mat_id || ':' || coalesce(v_scope, 'shop')));
      v_available := public.material_balance(v_mat_id, v_scope); -- current balance already nets the old issue
      if not coalesce(v_allow_neg, false) and (v_new_qty - v_old_qty) > v_available then
        raise exception 'Insufficient stock for "%": only % % more available.',
          v_mat_name, v_available, v_mat_unit;
      end if;
    end if;

    update material_issues set quantity = v_new_qty, updated_at = now() where id = v_issue_id;
  end loop;

  update delivery_challans
    set lines = p_lines,
        reference = p_reference,
        vehicle_no = p_vehicle_no,
        notes = p_notes,
        updated_at = now()
    where id = p_id;

  return query select * from delivery_challans where id = p_id;
end;
$$;

grant execute on function public.update_challan_quantities(text, text, text, text, jsonb) to authenticated;
