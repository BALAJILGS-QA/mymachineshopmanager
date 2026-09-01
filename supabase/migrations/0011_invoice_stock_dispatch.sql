-- ============================================================================
-- Inventory redesign - Phase 1c: direct-invoice inventory (deduct on create)
-- ============================================================================
-- An invoice line may carry a material_id (+ owner_type). When present, creating
-- the invoice posts a stock-out (material_issues, reference_type = 'INVOICE') for
-- that material - exactly like a delivery-challan dispatch - so billing directly
-- against stock reduces the balance. Lines WITHOUT a material_id never touch
-- stock: invoices raised FROM a delivery challan import their lines without a
-- material_id (the challan already deducted), so there is no double counting.
--
-- Deductions are aggregated per (material, scope), advisory-locked and stock-
-- checked (honouring settings.allowNegativeStock), all inside create_invoice's
-- transaction (all-or-nothing). Cancelling an invoice reverses its own stock
-- issues with compensating +qty adjustments (originals preserved for audit),
-- mirroring cancel_challan. Idempotent via the existing
-- (reference_type, reference_id, material_id) unique index. Additive - no DROP.
-- ============================================================================

alter table public.invoice_lines
  add column if not exists material_id text references public.materials(id),
  add column if not exists owner_type  text;

create or replace function public.create_invoice(
  p_id text, p_invoice_no text, p_date date, p_company_id text,
  p_billing_address text, p_shipping_address text, p_reference text, p_dc_reference text,
  p_discount numeric, p_tax_percent numeric, p_cgst_percent numeric, p_sgst_percent numeric,
  p_status invoice_status, p_notes text, p_lines jsonb
) returns setof public.invoices
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line      jsonb;
  v_i         int := 0;
  v_allow_neg boolean;
  v_unit      text;
  v_mat_name  text;
  v_available numeric;
  rec         record;
begin
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one line item';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if (v_line ->> 'quantity')::numeric <= 0 or (v_line ->> 'rate')::numeric < 0 then
      raise exception 'Line quantity must be > 0 and rate must be >= 0';
    end if;
  end loop;

  insert into public.invoices (id, invoice_no, date, company_id, billing_address, shipping_address,
    reference, dc_reference, discount, tax_percent, cgst_percent, sgst_percent, status, notes)
  values (p_id, p_invoice_no, p_date, p_company_id, p_billing_address, p_shipping_address,
    p_reference, p_dc_reference, coalesce(p_discount, 0), coalesce(p_tax_percent, 0),
    p_cgst_percent, p_sgst_percent, p_status, p_notes);

  v_i := 0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.invoice_lines
      (id, invoice_id, job_id, description, quantity, rate, line_no, material_id, owner_type)
    values (v_line ->> 'id', p_id, nullif(v_line ->> 'jobId', ''), v_line ->> 'description',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'rate')::numeric, v_i,
      nullif(v_line ->> 'materialId', ''), nullif(v_line ->> 'ownerType', ''));
    v_i := v_i + 1;
  end loop;

  -- Stock-out for material-linked lines (a Cancelled invoice dispatches nothing).
  if p_status <> 'Cancelled' then
    select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
      into v_allow_neg from public.app_state where id = 'singleton';

    v_i := 0;
    -- Aggregate per (material, scope): repeated materials collapse to one issue
    -- (the reference/material unique index permits only one per material). scope
    -- = null for 'Shop' (own stock), else the invoice's company.
    for rec in
      select
        nullif(l ->> 'materialId', '')                                                     as material_id,
        case when coalesce(l ->> 'ownerType', 'Company') = 'Shop' then null else p_company_id end as scope,
        sum((l ->> 'quantity')::numeric)                                                    as qty,
        min(nullif(l ->> 'jobId', ''))                                                      as job_id
      from jsonb_array_elements(p_lines) as l
      where nullif(l ->> 'materialId', '') is not null
      group by 1, 2
    loop
      select name, unit into v_mat_name, v_unit from public.materials where id = rec.material_id;
      if not found then raise exception 'Select a valid material'; end if;
      perform pg_advisory_xact_lock(hashtext(rec.material_id || ':' || coalesce(rec.scope, 'shop')));
      v_available := public.material_balance(rec.material_id, rec.scope);
      if not coalesce(v_allow_neg, false) and rec.qty > v_available then
        raise exception 'Insufficient stock for "%": available % %, requested %.',
          v_mat_name, v_available, v_unit, rec.qty;
      end if;
      insert into public.material_issues
        (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note, reference_type, reference_id)
      values (p_id || '_iss_' || v_i, p_invoice_no || '/' || v_i, p_date, rec.material_id,
              rec.job_id, rec.scope, rec.qty, coalesce(v_unit, 'Nos'),
              'Billed via invoice ' || p_invoice_no, 'INVOICE', p_id);
      v_i := v_i + 1;
    end loop;
  end if;

  return query select * from public.invoices where id = p_id;
end;
$$;

create or replace function public.set_invoice_status(p_id text, p_status invoice_status)
returns setof public.invoices
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_paid       numeric;
  v_invoice_no text;
  r            record;
begin
  select invoice_no into v_invoice_no from public.invoices where id = p_id;
  if not found then raise exception 'Invoice not found'; end if;

  if p_status = 'Cancelled' then
    -- invoice not yet cancelled, so invoice_totals.paid is the live paid amount.
    select paid into v_paid from public.invoice_totals where invoice_id = p_id;
    if coalesce(v_paid, 0) > 0 then
      raise exception 'Invoice has payments recorded. Remove payments before cancelling.';
    end if;
    -- Reverse this invoice's own stock-outs (direct-invoice dispatch) with a
    -- compensating +qty adjustment each (originals kept for audit). Invoices
    -- raised from a challan have no INVOICE-referenced issues, so this is a no-op
    -- for them and the challan keeps its own dispatch.
    for r in select * from public.material_issues
             where reference_type = 'INVOICE' and reference_id = p_id loop
      insert into public.stock_adjustments (id, adj_no, date, material_id, company_id, quantity, unit, reason)
      values (p_id || '_rev_' || r.id, 'REV/' || r.issue_no, current_date, r.material_id,
              r.company_id, r.quantity, r.unit, 'Reversal: invoice ' || v_invoice_no || ' cancelled')
      on conflict (id) do nothing;
    end loop;
    -- Free any delivery challan raised against this invoice.
    update public.delivery_challans set status = 'Open', invoice_id = null, updated_at = now()
      where invoice_id = p_id;
  end if;

  update public.invoices set status = p_status, updated_at = now() where id = p_id;
  return query select * from public.invoices where id = p_id;
end;
$$;

grant execute on function public.create_invoice(text, text, date, text, text, text, text, text, numeric, numeric, numeric, numeric, invoice_status, text, jsonb) to authenticated;
grant execute on function public.set_invoice_status(text, invoice_status) to authenticated;
