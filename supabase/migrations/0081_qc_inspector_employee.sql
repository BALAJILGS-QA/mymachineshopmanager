-- ============================================================================
-- Production Planning — QC inspector as an HRM employee
-- ============================================================================
-- Extends qc_record_inspection with an optional trailing p_inspector_employee_id
-- so the inspection stores the HRM employee FK (qc_inspections.inspector_employee_id,
-- added in 0080) alongside the existing free-text inspector name. Everything else
-- is byte-identical to the live 0072 function — the new parameter has a default,
-- so existing callers are unaffected. QC time itself is tracked through the labor
-- ledger (activity 'QC') via the Shop Floor board.
--
-- Idempotent (create or replace). Reversible: re-create the function without the
-- trailing parameter / column (restore 0072 body).
-- Next free number after 0080.
-- ============================================================================

-- Adding a trailing parameter creates an OVERLOAD, not a replacement — drop the
-- original 11-arg 0072 signature so PostgREST has a single unambiguous function.
drop function if exists public.qc_record_inspection(
  text, text, text, numeric, numeric, numeric, numeric, text, text, jsonb, text);

create or replace function public.qc_record_inspection(
  p_inspection_id text, p_job_id text, p_inspector text, p_produced numeric,
  p_accepted numeric, p_rejected numeric, p_rework numeric, p_decision text,
  p_remarks text, p_dimensions jsonb, p_event_id text,
  p_inspector_employee_id text default null)
returns public.qc_inspections
language plpgsql security definer set search_path = public as $function$
declare
  j          public.job_orders;
  v_target   job_status;
  v_dim      jsonb;
  v_smp      jsonb;
  v_dim_id   text;
  v_nominal  numeric;
  v_tplus    numeric;
  v_tminus   numeric;
  v_val      numeric;
  v_pass     boolean;
  v_result   text;
  v_acc_tot  numeric;
  v_rej_tot  numeric;
  v_rework_out numeric;
  v_ins      public.qc_inspections;
begin
  select * into j from public.job_orders where id = p_job_id;
  if not found then raise exception 'Job order not found'; end if;
  if not public.has_tenant_access(j.tenant_id) then
    raise exception 'Not authorized for this job (tenant)';
  end if;
  if not public.prod_can('QC_INSPECT') then
    raise exception 'Not authorized to perform QC inspection' using errcode = 'P0001';
  end if;
  if j.status <> 'Quality Control' then
    raise exception 'Job % is not in Quality Control (status: %)', j.job_no, j.status using errcode = 'P0001';
  end if;
  if p_decision not in ('Approved','Rejected','Rework') then
    raise exception 'Invalid QC decision: %', p_decision using errcode = 'P0001';
  end if;

  -- Quantity integrity (server-side).
  if coalesce(p_produced,0) <= 0 then raise exception 'Produced/inspected quantity must be > 0'; end if;
  if p_accepted < 0 or p_rejected < 0 or p_rework < 0 then raise exception 'QC quantities cannot be negative'; end if;
  if (p_accepted + p_rejected + p_rework) <> p_produced then
    raise exception 'Accepted + Rejected + Rework (%) must equal produced (%).',
      (p_accepted + p_rejected + p_rework), p_produced using errcode = 'P0001';
  end if;

  v_target := case p_decision
    when 'Approved' then 'QC Approved'::job_status
    when 'Rejected' then 'QC Rejected'::job_status
    else 'Rework'::job_status end;

  -- Decision/quantity consistency.
  if p_decision = 'Approved' and p_accepted <= 0 then
    raise exception 'Cannot approve with zero accepted quantity' using errcode = 'P0001';
  end if;
  if p_decision = 'Approved' and p_rework > 0 then
    raise exception 'Cannot approve while rework quantity is outstanding; choose Rework' using errcode = 'P0001';
  end if;
  if p_decision = 'Rejected' and p_accepted > 0 then
    raise exception 'A Rejected decision cannot have accepted quantity' using errcode = 'P0001';
  end if;
  if p_decision = 'Rework' and p_rework <= 0 then
    raise exception 'A Rework decision requires rework quantity > 0' using errcode = 'P0001';
  end if;

  -- Authorization for the resulting transition (QC_APPROVE / QC_REJECT / QC_REWORK).
  perform public.prod_assert_transition('Quality Control'::job_status, v_target);

  v_result := case
    when p_accepted = p_produced then 'Pass'
    when p_accepted = 0 then 'Fail'
    else 'Partial' end;

  insert into public.qc_inspections (
    id, inspection_no, job_id, inspector, inspector_employee_id, inspected_at,
    produced_qty, accepted_qty, rejected_qty, rework_qty, result, decision, remarks, tenant_id
  ) values (
    p_inspection_id,
    'QC-' || lpad(public.next_seq('qc')::text, 5, '0'),
    p_job_id, p_inspector, p_inspector_employee_id, now(),
    p_produced, p_accepted, p_rejected, p_rework, v_result, p_decision, p_remarks, j.tenant_id
  ) returning * into v_ins;

  -- Dimensions + per-sample measurements with server-side pass/fail.
  if p_dimensions is not null then
    for v_dim in select * from jsonb_array_elements(p_dimensions)
    loop
      v_dim_id := 'qcd_' || replace(gen_random_uuid()::text, '-', '');
      v_nominal := nullif(v_dim ->> 'nominal','')::numeric;
      v_tplus   := nullif(v_dim ->> 'tolPlus','')::numeric;
      v_tminus  := nullif(v_dim ->> 'tolMinus','')::numeric;
      insert into public.qc_dimensions (id, inspection_id, seq, name, nominal, unit, tol_plus, tol_minus, specification, tenant_id)
      values (
        v_dim_id, p_inspection_id, coalesce((v_dim ->> 'seq')::int, 0),
        coalesce(v_dim ->> 'name',''), v_nominal, v_dim ->> 'unit', v_tplus, v_tminus,
        v_dim ->> 'specification', j.tenant_id
      );
      if (v_dim -> 'samples') is not null then
        for v_smp in select * from jsonb_array_elements(v_dim -> 'samples')
        loop
          v_val := nullif(v_smp ->> 'value','')::numeric;
          if v_val is null or v_nominal is null then
            v_pass := null;
          else
            v_pass := (v_val >= v_nominal - coalesce(v_tminus,0))
                  and (v_val <= v_nominal + coalesce(v_tplus,0));
          end if;
          insert into public.qc_measurements (id, dimension_id, sample_no, measured_value, is_pass, tenant_id)
          values ('qcm_' || replace(gen_random_uuid()::text, '-', ''), v_dim_id,
                  (v_smp ->> 'sampleNo')::int, v_val, v_pass, j.tenant_id);
        end loop;
      end if;
    end loop;
  end if;

  -- Roll up cumulative QC quantities onto the job (details stay in qc_* tables).
  select coalesce(sum(accepted_qty),0), coalesce(sum(rejected_qty),0)
    into v_acc_tot, v_rej_tot from public.qc_inspections where job_id = p_job_id;
  v_rework_out := greatest(p_rework, 0);

  update public.job_orders
     set accepted_qty = v_acc_tot, rejected_qty = v_rej_tot, rework_qty = v_rework_out,
         status = v_target, updated_at = now()
   where id = p_job_id;

  insert into public.production_events (id, job_id, type, from_status, to_status, completed_qty, note, operator, at)
  values (p_event_id, p_job_id, 'Status', 'Quality Control'::job_status, v_target, p_produced,
          coalesce(p_remarks, 'QC ' || p_decision), p_inspector, now());

  perform public.hr_log('qc_inspection', 'job_order', p_job_id,
    format('QC %s: accepted %s / rejected %s / rework %s of %s', p_decision, p_accepted, p_rejected, p_rework, p_produced),
    null, to_jsonb(v_ins), j.company_id, null);

  return v_ins;
end $function$;

grant execute on function public.qc_record_inspection(text, text, text, numeric, numeric, numeric, numeric, text, text, jsonb, text, text) to authenticated;
