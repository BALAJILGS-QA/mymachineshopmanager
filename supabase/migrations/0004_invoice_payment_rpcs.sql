-- ============================================================================
-- Phase 6 - Invoice + payment RPCs
-- ============================================================================
-- Ports invoiceRepo.create/setStatus and paymentRepo.create from repo.ts.
-- Uses the invoice_totals view for outstanding/paid/total. Doc numbers formatted
-- client-side and passed in; invoice_no uniqueness enforced by the unique
-- constraint. SECURITY INVOKER. Idempotent. Additive. No DROP/TRUNCATE.
-- ============================================================================

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
  v_line jsonb;
  v_i    int := 0;
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

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.invoice_lines (id, invoice_id, job_id, description, quantity, rate, line_no)
    values (v_line ->> 'id', p_id, nullif(v_line ->> 'jobId', ''), v_line ->> 'description',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'rate')::numeric, v_i);
    v_i := v_i + 1;
  end loop;

  return query select * from public.invoices where id = p_id;
end;
$$;

create or replace function public.create_payment(
  p_id text, p_payment_no text, p_date date, p_company_id text, p_invoice_id text,
  p_amount numeric, p_method payment_method, p_reference text, p_is_advance boolean, p_notes text
) returns setof public.payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status      invoice_status;
  v_outstanding numeric;
  v_total       numeric;
  v_paid        numeric;
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_invoice_id is not null and not coalesce(p_is_advance, false) then
    select status into v_status from public.invoices where id = p_invoice_id;
    if not found then raise exception 'Invoice not found'; end if;
    if v_status = 'Cancelled' then
      raise exception 'Cannot record payment against a cancelled invoice';
    end if;
    select outstanding into v_outstanding from public.invoice_totals where invoice_id = p_invoice_id;
    if p_amount > coalesce(v_outstanding, 0) + 0.001 then
      raise exception 'Amount exceeds outstanding (%). Mark as advance to allow.', coalesce(v_outstanding, 0);
    end if;
  end if;

  insert into public.payments (id, payment_no, date, company_id, invoice_id, amount, method, reference, is_advance, notes)
  values (p_id, p_payment_no, p_date, p_company_id, p_invoice_id, p_amount, p_method, p_reference, coalesce(p_is_advance, false), p_notes);

  -- Recompute linked invoice status (Draft/Cancelled are preserved).
  if p_invoice_id is not null then
    select status into v_status from public.invoices where id = p_invoice_id;
    if v_status not in ('Draft', 'Cancelled') then
      select total, paid into v_total, v_paid from public.invoice_totals where invoice_id = p_invoice_id;
      update public.invoices set
        status = case
          when coalesce(v_paid, 0) <= 0 then 'Unpaid'::invoice_status
          when coalesce(v_paid, 0) + 0.001 < coalesce(v_total, 0) then 'Partially Paid'::invoice_status
          else 'Paid'::invoice_status end,
        updated_at = now()
      where id = p_invoice_id;
    end if;
  end if;

  return query select * from public.payments where id = p_id;
end;
$$;

create or replace function public.set_invoice_status(p_id text, p_status invoice_status)
returns setof public.invoices
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_paid numeric;
begin
  perform 1 from public.invoices where id = p_id;
  if not found then raise exception 'Invoice not found'; end if;

  if p_status = 'Cancelled' then
    -- invoice not yet cancelled, so invoice_totals.paid is the live paid amount.
    select paid into v_paid from public.invoice_totals where invoice_id = p_id;
    if coalesce(v_paid, 0) > 0 then
      raise exception 'Invoice has payments recorded. Remove payments before cancelling.';
    end if;
    -- Free any delivery challan raised against this invoice.
    update public.delivery_challans set status = 'Open', invoice_id = null, updated_at = now()
      where invoice_id = p_id;
  end if;

  update public.invoices set status = p_status, updated_at = now() where id = p_id;
  return query select * from public.invoices where id = p_id;
end;
$$;

grant execute on function public.create_invoice(text, text, date, text, text, text, text, text, numeric, numeric, numeric, numeric, invoice_status, text, jsonb) to authenticated;
grant execute on function public.create_payment(text, text, date, text, text, numeric, payment_method, text, boolean, text) to authenticated;
grant execute on function public.set_invoice_status(text, invoice_status) to authenticated;
