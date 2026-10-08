-- ============================================================================
-- Production Planning — Estimation & Quotation RPCs
-- ============================================================================
-- Rule-bearing, atomic mutations for the 0087 tables. All run SECURITY INVOKER
-- (so tenant RLS applies to every read/write) with prod_can() permission gates
-- (bootstrap-friendly: single-admin tenants with no roles configured keep
-- working). Every mutation writes an hr_audit_log row. Numbers are passed in by
-- the client from the race-safe next_seq sequence (numbering.ts), with the
-- unique (tenant, no) index as a backstop.
--
-- Idempotent (create or replace). Reversible: drop the functions (see foot).
-- Next free after 0087.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. create_estimation — header + operations in one transaction
-- ---------------------------------------------------------------------------
create or replace function public.create_estimation(
  p_id text, p_estimation_no text, p_header jsonb, p_operations jsonb default '[]'::jsonb)
returns public.estimations
language plpgsql security invoker set search_path = public as $$
declare
  v_est public.estimations;
  v_op  jsonb;
  v_seq int := 0;
begin
  if not public.prod_can('ESTIMATION_CREATE') then
    raise exception 'Not authorized to create estimations' using errcode = 'P0001';
  end if;
  if coalesce(p_header->>'part_name','') = '' then raise exception 'Part name is required'; end if;
  if coalesce(p_header->>'company_id','') = '' then raise exception 'Customer is required'; end if;
  if coalesce((p_header->>'quantity')::numeric, 0) <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  insert into public.estimations (
    id, estimation_no, estimation_date, company_id, customer_part_number, part_name,
    part_description, drawing_number, drawing_revision, product_id, material_id, material_grade,
    raw_material_form, material_shape_dims, finished_dims, material_density, material_rate,
    cutting_allowance, machining_allowance, wastage_percent, scrap_recovery_pc, quantity,
    expected_delivery_date, manufacturing_notes, drawing_path,
    fixtures_tooling_cost, inspection_cost_pc, overhead_cost_pc, labour_cost_pc, packing_cost_pc,
    transport_cost_pc, outsource_cost_pc, rejection_percent, other_cost_pc,
    pricing_method, markup_percent, margin_percent,
    material_cost_pc, machining_cost_pc, total_cost_pc, selling_price_pc, total_cost, total_selling,
    margin_pct_effective, status, created_by, updated_by
  ) values (
    p_id, p_estimation_no, coalesce((p_header->>'estimation_date')::date, current_date),
    p_header->>'company_id', p_header->>'customer_part_number', p_header->>'part_name',
    p_header->>'part_description', p_header->>'drawing_number', p_header->>'drawing_revision',
    nullif(p_header->>'product_id',''), nullif(p_header->>'material_id',''), p_header->>'material_grade',
    p_header->>'raw_material_form', nullif(p_header->'material_shape_dims','null'::jsonb),
    p_header->>'finished_dims', nullif(p_header->>'material_density','')::numeric,
    nullif(p_header->>'material_rate','')::numeric,
    coalesce((p_header->>'cutting_allowance')::numeric,0), coalesce((p_header->>'machining_allowance')::numeric,0),
    coalesce((p_header->>'wastage_percent')::numeric,0), coalesce((p_header->>'scrap_recovery_pc')::numeric,0),
    (p_header->>'quantity')::numeric, nullif(p_header->>'expected_delivery_date','')::date,
    p_header->>'manufacturing_notes', p_header->>'drawing_path',
    coalesce((p_header->>'fixtures_tooling_cost')::numeric,0), coalesce((p_header->>'inspection_cost_pc')::numeric,0),
    coalesce((p_header->>'overhead_cost_pc')::numeric,0), coalesce((p_header->>'labour_cost_pc')::numeric,0),
    coalesce((p_header->>'packing_cost_pc')::numeric,0), coalesce((p_header->>'transport_cost_pc')::numeric,0),
    coalesce((p_header->>'outsource_cost_pc')::numeric,0), coalesce((p_header->>'rejection_percent')::numeric,0),
    coalesce((p_header->>'other_cost_pc')::numeric,0),
    coalesce(p_header->>'pricing_method','margin'), coalesce((p_header->>'markup_percent')::numeric,0),
    coalesce((p_header->>'margin_percent')::numeric,0),
    coalesce((p_header->>'material_cost_pc')::numeric,0), coalesce((p_header->>'machining_cost_pc')::numeric,0),
    coalesce((p_header->>'total_cost_pc')::numeric,0), coalesce((p_header->>'selling_price_pc')::numeric,0),
    coalesce((p_header->>'total_cost')::numeric,0), coalesce((p_header->>'total_selling')::numeric,0),
    coalesce((p_header->>'margin_pct_effective')::numeric,0),
    coalesce(p_header->>'status','Draft'), public.hr_current_email(), public.hr_current_email()
  ) returning * into v_est;

  for v_op in select * from jsonb_array_elements(coalesce(p_operations,'[]'::jsonb))
  loop
    v_seq := v_seq + 1;
    insert into public.estimation_operations (
      id, estimation_id, seq, operation_name, machine_type, setup_time_min, cycle_time_min,
      batch_qty, machine_hour_rate, operator_cost_hour, tooling_cost, subcontract_cost_pc, notes
    ) values (
      coalesce(nullif(v_op->>'id',''), 'eop_' || replace(gen_random_uuid()::text,'-','')),
      p_id, coalesce((v_op->>'seq')::int, v_seq), coalesce(v_op->>'operation_name','Operation'),
      v_op->>'machine_type', coalesce((v_op->>'setup_time_min')::numeric,0),
      coalesce((v_op->>'cycle_time_min')::numeric,0), coalesce((v_op->>'batch_qty')::numeric,1),
      coalesce((v_op->>'machine_hour_rate')::numeric,0), coalesce((v_op->>'operator_cost_hour')::numeric,0),
      coalesce((v_op->>'tooling_cost')::numeric,0), coalesce((v_op->>'subcontract_cost_pc')::numeric,0),
      v_op->>'notes'
    );
  end loop;

  perform public.hr_log('estimation_create', 'estimation', p_id,
    format('Estimation %s for %s (qty %s)', p_estimation_no, v_est.part_name, v_est.quantity),
    null, to_jsonb(v_est), v_est.company_id, null);
  return v_est;
end $$;

-- ---------------------------------------------------------------------------
-- 2. update_estimation — replace header + operations (draft-editable only)
-- ---------------------------------------------------------------------------
create or replace function public.update_estimation(
  p_id text, p_header jsonb, p_operations jsonb default '[]'::jsonb)
returns public.estimations
language plpgsql security invoker set search_path = public as $$
declare
  v_est public.estimations;
  v_op  jsonb;
  v_seq int := 0;
begin
  if not public.prod_can('ESTIMATION_CREATE') then
    raise exception 'Not authorized to edit estimations' using errcode = 'P0001';
  end if;
  select * into v_est from public.estimations where id = p_id;
  if not found then raise exception 'Estimation not found'; end if;
  if v_est.status in ('Approved','Converted to Quotation') then
    raise exception 'An % estimation cannot be edited', v_est.status using errcode = 'P0001';
  end if;

  update public.estimations set
    estimation_date = coalesce((p_header->>'estimation_date')::date, estimation_date),
    company_id = coalesce(p_header->>'company_id', company_id),
    customer_part_number = p_header->>'customer_part_number',
    part_name = coalesce(p_header->>'part_name', part_name),
    part_description = p_header->>'part_description',
    drawing_number = p_header->>'drawing_number',
    drawing_revision = p_header->>'drawing_revision',
    product_id = nullif(p_header->>'product_id',''),
    material_id = nullif(p_header->>'material_id',''),
    material_grade = p_header->>'material_grade',
    raw_material_form = p_header->>'raw_material_form',
    material_shape_dims = nullif(p_header->'material_shape_dims','null'::jsonb),
    finished_dims = p_header->>'finished_dims',
    material_density = nullif(p_header->>'material_density','')::numeric,
    material_rate = nullif(p_header->>'material_rate','')::numeric,
    cutting_allowance = coalesce((p_header->>'cutting_allowance')::numeric,0),
    machining_allowance = coalesce((p_header->>'machining_allowance')::numeric,0),
    wastage_percent = coalesce((p_header->>'wastage_percent')::numeric,0),
    scrap_recovery_pc = coalesce((p_header->>'scrap_recovery_pc')::numeric,0),
    quantity = coalesce((p_header->>'quantity')::numeric, quantity),
    expected_delivery_date = nullif(p_header->>'expected_delivery_date','')::date,
    manufacturing_notes = p_header->>'manufacturing_notes',
    drawing_path = coalesce(p_header->>'drawing_path', drawing_path),
    fixtures_tooling_cost = coalesce((p_header->>'fixtures_tooling_cost')::numeric,0),
    inspection_cost_pc = coalesce((p_header->>'inspection_cost_pc')::numeric,0),
    overhead_cost_pc = coalesce((p_header->>'overhead_cost_pc')::numeric,0),
    labour_cost_pc = coalesce((p_header->>'labour_cost_pc')::numeric,0),
    packing_cost_pc = coalesce((p_header->>'packing_cost_pc')::numeric,0),
    transport_cost_pc = coalesce((p_header->>'transport_cost_pc')::numeric,0),
    outsource_cost_pc = coalesce((p_header->>'outsource_cost_pc')::numeric,0),
    rejection_percent = coalesce((p_header->>'rejection_percent')::numeric,0),
    other_cost_pc = coalesce((p_header->>'other_cost_pc')::numeric,0),
    pricing_method = coalesce(p_header->>'pricing_method', pricing_method),
    markup_percent = coalesce((p_header->>'markup_percent')::numeric,0),
    margin_percent = coalesce((p_header->>'margin_percent')::numeric,0),
    material_cost_pc = coalesce((p_header->>'material_cost_pc')::numeric,0),
    machining_cost_pc = coalesce((p_header->>'machining_cost_pc')::numeric,0),
    total_cost_pc = coalesce((p_header->>'total_cost_pc')::numeric,0),
    selling_price_pc = coalesce((p_header->>'selling_price_pc')::numeric,0),
    total_cost = coalesce((p_header->>'total_cost')::numeric,0),
    total_selling = coalesce((p_header->>'total_selling')::numeric,0),
    margin_pct_effective = coalesce((p_header->>'margin_pct_effective')::numeric,0),
    updated_by = public.hr_current_email(), updated_at = now()
  where id = p_id returning * into v_est;

  delete from public.estimation_operations where estimation_id = p_id;
  for v_op in select * from jsonb_array_elements(coalesce(p_operations,'[]'::jsonb))
  loop
    v_seq := v_seq + 1;
    insert into public.estimation_operations (
      id, estimation_id, seq, operation_name, machine_type, setup_time_min, cycle_time_min,
      batch_qty, machine_hour_rate, operator_cost_hour, tooling_cost, subcontract_cost_pc, notes
    ) values (
      coalesce(nullif(v_op->>'id',''), 'eop_' || replace(gen_random_uuid()::text,'-','')),
      p_id, coalesce((v_op->>'seq')::int, v_seq), coalesce(v_op->>'operation_name','Operation'),
      v_op->>'machine_type', coalesce((v_op->>'setup_time_min')::numeric,0),
      coalesce((v_op->>'cycle_time_min')::numeric,0), coalesce((v_op->>'batch_qty')::numeric,1),
      coalesce((v_op->>'machine_hour_rate')::numeric,0), coalesce((v_op->>'operator_cost_hour')::numeric,0),
      coalesce((v_op->>'tooling_cost')::numeric,0), coalesce((v_op->>'subcontract_cost_pc')::numeric,0),
      v_op->>'notes'
    );
  end loop;

  perform public.hr_log('estimation_update', 'estimation', p_id,
    format('Updated estimation %s', v_est.estimation_no), null, to_jsonb(v_est), v_est.company_id, null);
  return v_est;
end $$;

-- ---------------------------------------------------------------------------
-- 3. set_estimation_status — validated lifecycle transitions
-- ---------------------------------------------------------------------------
create or replace function public.set_estimation_status(p_id text, p_status text)
returns public.estimations
language plpgsql security invoker set search_path = public as $$
declare v_est public.estimations; v_from text; v_perm text;
begin
  select * into v_est from public.estimations where id = p_id;
  if not found then raise exception 'Estimation not found'; end if;
  v_from := v_est.status;
  if v_from = p_status then return v_est; end if;

  -- allowed transitions
  if not (
    (v_from = 'Draft'        and p_status in ('Under Review','Approved','Rejected')) or
    (v_from = 'Under Review' and p_status in ('Approved','Rejected','Draft')) or
    (v_from = 'Rejected'     and p_status in ('Draft','Under Review')) or
    (v_from = 'Approved'     and p_status in ('Under Review'))
  ) then
    raise exception 'Invalid estimation status change: % -> %', v_from, p_status using errcode = 'P0001';
  end if;

  v_perm := case when p_status in ('Approved','Rejected') then 'ESTIMATION_APPROVE' else 'ESTIMATION_CREATE' end;
  if not public.prod_can(v_perm) then
    raise exception 'Not authorized to set estimation status to %', p_status using errcode = 'P0001';
  end if;

  update public.estimations
     set status = p_status,
         approved_by = case when p_status = 'Approved' then public.hr_current_email() else approved_by end,
         approved_at = case when p_status = 'Approved' then now() else approved_at end,
         updated_by = public.hr_current_email(), updated_at = now()
   where id = p_id returning * into v_est;

  perform public.hr_log('estimation_status', 'estimation', p_id,
    format('Estimation %s: %s -> %s', v_est.estimation_no, v_from, p_status), null, to_jsonb(v_est), v_est.company_id, null);
  return v_est;
end $$;

-- ---------------------------------------------------------------------------
-- 4. create_quotation — header + lines; marks source estimation converted
-- ---------------------------------------------------------------------------
create or replace function public.create_quotation(
  p_id text, p_quotation_no text, p_header jsonb, p_lines jsonb default '[]'::jsonb)
returns public.quotations
language plpgsql security invoker set search_path = public as $$
declare v_q public.quotations; v_line jsonb; v_no int := 0; v_est_id text;
begin
  if not public.prod_can('QUOTATION_CREATE') then
    raise exception 'Not authorized to create quotations' using errcode = 'P0001';
  end if;
  if coalesce(p_header->>'company_id','') = '' then raise exception 'Customer is required'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'At least one quotation line is required'; end if;

  insert into public.quotations (
    id, quotation_no, quotation_date, expiry_date, company_id, estimation_id, billing_address,
    shipping_address, customer_gstin, contact_person, contact_phone, contact_email,
    place_of_supply_state_code, advance_percent, payment_terms, delivery_lead_time,
    packing_charge, freight_charge, cgst_percent, sgst_percent, igst_percent,
    subtotal, discount_total, taxable_value, cgst_amount, sgst_amount, igst_amount, grand_total,
    notes, terms_conditions, status, revision_no, revises_quotation_id, created_by, updated_by
  ) values (
    p_id, p_quotation_no, coalesce((p_header->>'quotation_date')::date, current_date),
    nullif(p_header->>'expiry_date','')::date, p_header->>'company_id', nullif(p_header->>'estimation_id',''),
    p_header->>'billing_address', p_header->>'shipping_address', p_header->>'customer_gstin',
    p_header->>'contact_person', p_header->>'contact_phone', p_header->>'contact_email',
    p_header->>'place_of_supply_state_code', coalesce((p_header->>'advance_percent')::numeric,0),
    p_header->>'payment_terms', p_header->>'delivery_lead_time',
    coalesce((p_header->>'packing_charge')::numeric,0), coalesce((p_header->>'freight_charge')::numeric,0),
    coalesce((p_header->>'cgst_percent')::numeric,0), coalesce((p_header->>'sgst_percent')::numeric,0),
    coalesce((p_header->>'igst_percent')::numeric,0),
    coalesce((p_header->>'subtotal')::numeric,0), coalesce((p_header->>'discount_total')::numeric,0),
    coalesce((p_header->>'taxable_value')::numeric,0), coalesce((p_header->>'cgst_amount')::numeric,0),
    coalesce((p_header->>'sgst_amount')::numeric,0), coalesce((p_header->>'igst_amount')::numeric,0),
    coalesce((p_header->>'grand_total')::numeric,0),
    p_header->>'notes', p_header->>'terms_conditions', coalesce(p_header->>'status','Draft'),
    coalesce((p_header->>'revision_no')::int,1), nullif(p_header->>'revises_quotation_id',''),
    public.hr_current_email(), public.hr_current_email()
  ) returning * into v_q;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb))
  loop
    v_no := v_no + 1;
    insert into public.quotation_lines (
      id, quotation_id, line_no, part_number, description, hsn, quantity, unit,
      unit_price, discount_percent, gst_percent, line_total
    ) values (
      coalesce(nullif(v_line->>'id',''), 'ql_' || replace(gen_random_uuid()::text,'-','')),
      p_id, coalesce((v_line->>'line_no')::int, v_no), v_line->>'part_number',
      coalesce(v_line->>'description','Item'), v_line->>'hsn', coalesce((v_line->>'quantity')::numeric,1),
      v_line->>'unit', coalesce((v_line->>'unit_price')::numeric,0),
      coalesce((v_line->>'discount_percent')::numeric,0), coalesce((v_line->>'gst_percent')::numeric,0),
      coalesce((v_line->>'line_total')::numeric,0)
    );
  end loop;

  insert into public.quotation_status_history (id, quotation_id, from_status, to_status, note, actor)
  values ('qsh_' || replace(gen_random_uuid()::text,'-',''), p_id, null, v_q.status, 'Created', public.hr_current_email());

  v_est_id := nullif(p_header->>'estimation_id','');
  if v_est_id is not null then
    update public.estimations set status = 'Converted to Quotation', updated_at = now()
      where id = v_est_id and status <> 'Converted to Quotation';
  end if;

  perform public.hr_log('quotation_create', 'quotation', p_id,
    format('Quotation %s for %s (total %s)', p_quotation_no, v_q.company_id, v_q.grand_total),
    null, to_jsonb(v_q), v_q.company_id, null);
  return v_q;
end $$;

-- ---------------------------------------------------------------------------
-- 5. update_quotation — replace header + lines (Draft / Pending Approval only)
-- ---------------------------------------------------------------------------
create or replace function public.update_quotation(
  p_id text, p_header jsonb, p_lines jsonb default '[]'::jsonb)
returns public.quotations
language plpgsql security invoker set search_path = public as $$
declare v_q public.quotations; v_line jsonb; v_no int := 0;
begin
  if not public.prod_can('QUOTATION_CREATE') then
    raise exception 'Not authorized to edit quotations' using errcode = 'P0001';
  end if;
  select * into v_q from public.quotations where id = p_id;
  if not found then raise exception 'Quotation not found'; end if;
  if v_q.status not in ('Draft','Pending Approval') then
    raise exception 'A % quotation cannot be edited — revise it instead', v_q.status using errcode = 'P0001';
  end if;

  update public.quotations set
    quotation_date = coalesce((p_header->>'quotation_date')::date, quotation_date),
    expiry_date = nullif(p_header->>'expiry_date','')::date,
    company_id = coalesce(p_header->>'company_id', company_id),
    billing_address = p_header->>'billing_address',
    shipping_address = p_header->>'shipping_address',
    customer_gstin = p_header->>'customer_gstin',
    contact_person = p_header->>'contact_person',
    contact_phone = p_header->>'contact_phone',
    contact_email = p_header->>'contact_email',
    place_of_supply_state_code = p_header->>'place_of_supply_state_code',
    advance_percent = coalesce((p_header->>'advance_percent')::numeric,0),
    payment_terms = p_header->>'payment_terms',
    delivery_lead_time = p_header->>'delivery_lead_time',
    packing_charge = coalesce((p_header->>'packing_charge')::numeric,0),
    freight_charge = coalesce((p_header->>'freight_charge')::numeric,0),
    cgst_percent = coalesce((p_header->>'cgst_percent')::numeric,0),
    sgst_percent = coalesce((p_header->>'sgst_percent')::numeric,0),
    igst_percent = coalesce((p_header->>'igst_percent')::numeric,0),
    subtotal = coalesce((p_header->>'subtotal')::numeric,0),
    discount_total = coalesce((p_header->>'discount_total')::numeric,0),
    taxable_value = coalesce((p_header->>'taxable_value')::numeric,0),
    cgst_amount = coalesce((p_header->>'cgst_amount')::numeric,0),
    sgst_amount = coalesce((p_header->>'sgst_amount')::numeric,0),
    igst_amount = coalesce((p_header->>'igst_amount')::numeric,0),
    grand_total = coalesce((p_header->>'grand_total')::numeric,0),
    notes = p_header->>'notes',
    terms_conditions = p_header->>'terms_conditions',
    updated_by = public.hr_current_email(), updated_at = now()
  where id = p_id returning * into v_q;

  delete from public.quotation_lines where quotation_id = p_id;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb))
  loop
    v_no := v_no + 1;
    insert into public.quotation_lines (
      id, quotation_id, line_no, part_number, description, hsn, quantity, unit,
      unit_price, discount_percent, gst_percent, line_total
    ) values (
      coalesce(nullif(v_line->>'id',''), 'ql_' || replace(gen_random_uuid()::text,'-','')),
      p_id, coalesce((v_line->>'line_no')::int, v_no), v_line->>'part_number',
      coalesce(v_line->>'description','Item'), v_line->>'hsn', coalesce((v_line->>'quantity')::numeric,1),
      v_line->>'unit', coalesce((v_line->>'unit_price')::numeric,0),
      coalesce((v_line->>'discount_percent')::numeric,0), coalesce((v_line->>'gst_percent')::numeric,0),
      coalesce((v_line->>'line_total')::numeric,0)
    );
  end loop;

  perform public.hr_log('quotation_update', 'quotation', p_id,
    format('Updated quotation %s', v_q.quotation_no), null, to_jsonb(v_q), v_q.company_id, null);
  return v_q;
end $$;

-- ---------------------------------------------------------------------------
-- 6. set_quotation_status — validated lifecycle + history + timestamps
-- ---------------------------------------------------------------------------
create or replace function public.set_quotation_status(p_id text, p_status text, p_note text default null)
returns public.quotations
language plpgsql security invoker set search_path = public as $$
declare v_q public.quotations; v_from text; v_perm text;
begin
  select * into v_q from public.quotations where id = p_id for update;
  if not found then raise exception 'Quotation not found'; end if;
  v_from := v_q.status;
  if v_from = p_status then return v_q; end if;

  if not (
    (v_from = 'Draft'            and p_status in ('Pending Approval','Approved','Cancelled')) or
    (v_from = 'Pending Approval' and p_status in ('Approved','Rejected','Draft','Cancelled')) or
    (v_from = 'Approved'         and p_status in ('Sent','Cancelled')) or
    (v_from = 'Sent'             and p_status in ('Accepted','Rejected','Expired','Cancelled')) or
    (v_from = 'Expired'          and p_status in ('Cancelled'))
  ) then
    raise exception 'Invalid quotation status change: % -> %', v_from, p_status using errcode = 'P0001';
  end if;

  -- An expired quote cannot be accepted (spec §8) — guarded by the matrix (Expired only -> Cancelled).
  -- An accepted quote is terminal here (convert to job separately) and cannot be silently overwritten.
  v_perm := case when p_status in ('Approved','Rejected','Cancelled') then 'QUOTATION_APPROVE' else 'QUOTATION_CREATE' end;
  if not public.prod_can(v_perm) then
    raise exception 'Not authorized to set quotation status to %', p_status using errcode = 'P0001';
  end if;

  update public.quotations set
    status = p_status,
    approved_by = case when p_status = 'Approved' then public.hr_current_email() else approved_by end,
    approved_at = case when p_status = 'Approved' then now() else approved_at end,
    sent_at     = case when p_status = 'Sent' then now() else sent_at end,
    accepted_at = case when p_status = 'Accepted' then now() else accepted_at end,
    rejected_at = case when p_status = 'Rejected' then now() else rejected_at end,
    updated_by = public.hr_current_email(), updated_at = now()
  where id = p_id returning * into v_q;

  insert into public.quotation_status_history (id, quotation_id, from_status, to_status, note, actor)
  values ('qsh_' || replace(gen_random_uuid()::text,'-',''), p_id, v_from, p_status, p_note, public.hr_current_email());

  perform public.hr_log('quotation_status', 'quotation', p_id,
    format('Quotation %s: %s -> %s', v_q.quotation_no, v_from, p_status), null, to_jsonb(v_q), v_q.company_id, null);
  return v_q;
end $$;

-- ---------------------------------------------------------------------------
-- 7. convert_quotation_to_job — idempotent; one job per accepted quotation
-- ---------------------------------------------------------------------------
-- Row-locks the quotation, refuses unless status='Accepted' AND no job linked
-- yet, then inserts a Production Order (job_orders) from the first line and
-- stamps job_order_id back on the quotation — all atomic, so repeated clicks /
-- retries can never create a duplicate job (spec §5/§8). No material auto-issue
-- at this stage (handled later on the floor).
create or replace function public.convert_quotation_to_job(
  p_quotation_id text, p_job_id text, p_job_no text)
returns public.job_orders
language plpgsql security invoker set search_path = public as $$
declare v_q public.quotations; v_line public.quotation_lines; v_job public.job_orders;
begin
  if not public.prod_can('QUOTATION_CONVERT') then
    raise exception 'Not authorized to convert quotations' using errcode = 'P0001';
  end if;
  select * into v_q from public.quotations where id = p_quotation_id for update;
  if not found then raise exception 'Quotation not found'; end if;
  if v_q.status <> 'Accepted' then
    raise exception 'Only an Accepted quotation can be converted (status: %)', v_q.status using errcode = 'P0001';
  end if;
  if v_q.job_order_id is not null then
    raise exception 'This quotation is already converted to a production order' using errcode = 'P0001';
  end if;

  select * into v_line from public.quotation_lines where quotation_id = p_quotation_id order by line_no limit 1;
  if not found then raise exception 'Quotation has no lines to convert'; end if;

  insert into public.job_orders (
    id, job_no, company_id, part_name, part_number, ordered_qty, completed_qty, rate,
    order_date, priority, status, notes
  ) values (
    p_job_id, p_job_no, v_q.company_id, coalesce(v_line.description, 'Part'), v_line.part_number,
    v_line.quantity, 0, v_line.unit_price, current_date, 'Normal', 'Pending',
    format('From quotation %s', v_q.quotation_no)
  ) returning * into v_job;

  update public.quotations set job_order_id = p_job_id, updated_by = public.hr_current_email(), updated_at = now()
    where id = p_quotation_id;

  perform public.hr_log('quotation_convert', 'quotation', p_quotation_id,
    format('Quotation %s converted to production order %s', v_q.quotation_no, p_job_no),
    null, to_jsonb(v_job), v_q.company_id, jsonb_build_object('job_id', p_job_id));
  return v_job;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.create_estimation(text, text, jsonb, jsonb)       to authenticated;
grant execute on function public.update_estimation(text, jsonb, jsonb)             to authenticated;
grant execute on function public.set_estimation_status(text, text)                 to authenticated;
grant execute on function public.create_quotation(text, text, jsonb, jsonb)        to authenticated;
grant execute on function public.update_quotation(text, jsonb, jsonb)              to authenticated;
grant execute on function public.set_quotation_status(text, text, text)            to authenticated;
grant execute on function public.convert_quotation_to_job(text, text, text)        to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (reversible):
--   drop function if exists public.convert_quotation_to_job(text,text,text);
--   drop function if exists public.set_quotation_status(text,text,text);
--   drop function if exists public.update_quotation(text,jsonb,jsonb);
--   drop function if exists public.create_quotation(text,text,jsonb,jsonb);
--   drop function if exists public.set_estimation_status(text,text);
--   drop function if exists public.update_estimation(text,jsonb,jsonb);
--   drop function if exists public.create_estimation(text,text,jsonb,jsonb);
-- ============================================================================
