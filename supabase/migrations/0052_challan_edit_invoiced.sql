-- ============================================================================
-- Delivery challan: allow full edit of an INVOICED challan (fields + materials)
-- ============================================================================
-- update_challan_full (0014) rejected any non-Open challan. Business now needs to
-- correct an invoiced challan in place (wrong item / qty / source), so this loosens
-- the gate to permit status = 'Open' OR 'Invoiced'. Cancelled challans stay locked:
-- their dispatch was already reversed with compensating adjustments, so re-posting
-- issues here would double-count stock.
--
-- Stock stays consistent because the RPC re-syncs it (delete this challan's issues,
-- stock-check, rewrite lines, re-post one issue per line) — same as for an Open
-- challan. dc_guard already yields to the tx-local app.allow_dc_line_edit flag the
-- RPC sets, regardless of status, so no trigger change is needed.
-- SECURITY INVOKER. Idempotent (CREATE OR REPLACE). Additive.
-- ============================================================================

create or replace function public.update_challan_full(
  p_id text, p_date date, p_company_id text, p_job_id text,
  p_reference text, p_vehicle_no text, p_notes text, p_lines jsonb
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
  select status, dc_no into v_status, v_dc_no from delivery_challans where id = p_id;
  if not found then raise exception 'Delivery challan not found'; end if;
  -- Open and Invoiced challans are editable; a cancelled one is not (its stock was
  -- already reversed — reopen or create a new challan instead).
  if v_status = 'Cancelled' then
    raise exception 'A cancelled challan cannot be edited. Reopen it or create a new one.';
  end if;
  if not exists (select 1 from companies where id = p_company_id) then
    raise exception 'Select a valid company';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from app_state where id = 'singleton';

  -- Permit rewriting this (dispatched/invoiced) challan's lines within the txn.
  perform set_config('app.allow_dc_line_edit', '1', true);

  -- Reverse the challan's current dispatch so the stock check sees the restored
  -- balance (full re-sync = delete + re-post; nets to zero if nothing changed).
  delete from material_issues
    where reference_type = 'DELIVERY_CHALLAN' and reference_id = p_id;

  -- Pass 1: validate + lock + stock-check every new line before writing.
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

  -- Apply all header changes + the new lines (permitted by the flag above).
  update delivery_challans
    set date = p_date,
        company_id = p_company_id,
        job_id = nullif(p_job_id, ''),
        reference = p_reference,
        vehicle_no = p_vehicle_no,
        notes = p_notes,
        lines = p_lines,
        updated_at = now()
    where id = p_id;

  -- Pass 2: re-post one stock-out issue per line under the (possibly new) scope.
  v_idx := 0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_mat_id   := v_line ->> 'materialId';
    v_owner    := coalesce(v_line ->> 'ownerType', 'Company');
    v_qty      := (v_line ->> 'quantity')::numeric;
    v_unit     := coalesce(v_line ->> 'unit', 'Nos');
    v_line_job := nullif(v_line ->> 'jobId', '');
    v_scope    := case when v_owner = 'Company' then p_company_id else null end;
    insert into material_issues (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note, reference_type, reference_id)
    values (p_id || '_iss_' || v_idx, v_dc_no || '/' || v_idx, p_date, v_mat_id,
            coalesce(v_line_job, nullif(p_job_id, '')), v_scope, v_qty, v_unit,
            'Dispatched via challan ' || v_dc_no, 'DELIVERY_CHALLAN', p_id);
    v_idx := v_idx + 1;
  end loop;

  return query select * from delivery_challans where id = p_id;
end;
$$;

grant execute on function public.update_challan_full(text, date, text, text, text, text, text, jsonb) to authenticated;
