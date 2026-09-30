-- ============================================================================
-- Invoice Payment & Settlement — part 3: settlement RPCs (Phase 5 backend).
-- ============================================================================
-- Depends on 0055 (enum 'Settled') + 0056 (allocations/deductions tables + view).
--
-- Adds:
--   • recompute_invoice_status(id) — the SINGLE status derivation, mirroring the
--     TS deriveInvoiceStatus. Reads the reworked invoice_totals (total/paid/settled).
--   • create_settlement(...) — atomic: payment header + allocations + deductions,
--     with allocation/customer/over-settlement validation, then status recompute
--     for every touched invoice. This is the multi-invoice, deduction-aware entry
--     point (the single-invoice create_payment stays for backward compat).
--
-- Rewrites (behavior-preserving for all existing, deduction-free data — settled
-- == paid when there are no deductions, so 'Settled' never fires for them):
--   • create_payment / delete_payment  → route through recompute_invoice_status;
--     delete_payment becomes multi-invoice aware (cascade-deletes allocations,
--     recomputes EVERY invoice the payment touched, not just payments.invoice_id).
--   • set_invoice_status → cancel guard blocks when there is ANY settlement
--     activity (settled > 0 or allocation/deduction rows), not just paid > 0.
--
-- GL-NEUTRAL: no journals are posted. The seam for a future GL phase is the
-- single call site at the end of create_settlement (see the marked comment); a
-- later migration can post a balanced journal there without touching this schema
-- or the allocation/deduction logic.
--
-- Allocation/deduction row ids are supplied by the client in the jsonb payload
-- (same convention as create_invoice's lines). SECURITY INVOKER: RLS on the base
-- tables governs access, exactly like create_payment. Idempotent. Additive.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shared status derivation (single source of truth, mirrors TS).
--   settled ≤ 0                     → Unpaid
--   settled < total                 → Partially Paid
--   settled ≥ total & paid ≥ total  → Paid    (cash fully covers the invoice)
--   settled ≥ total & paid < total  → Settled (closed via deductions)
-- Draft/Cancelled are preserved (never auto-changed).
-- ---------------------------------------------------------------------------
create or replace function public.recompute_invoice_status(p_invoice_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status  invoice_status;
  v_total   numeric;
  v_paid    numeric;
  v_settled numeric;
begin
  if p_invoice_id is null then return; end if;
  select status into v_status from public.invoices where id = p_invoice_id;
  if not found or v_status in ('Draft', 'Cancelled') then return; end if;

  select total, paid, settled into v_total, v_paid, v_settled
    from public.invoice_totals where invoice_id = p_invoice_id;

  update public.invoices set
    status = case
      when coalesce(v_settled, 0) <= 0 then 'Unpaid'::invoice_status
      when coalesce(v_settled, 0) + 0.001 < coalesce(v_total, 0) then 'Partially Paid'::invoice_status
      when coalesce(v_paid, 0) + 0.001 >= coalesce(v_total, 0) then 'Paid'::invoice_status
      else 'Settled'::invoice_status end,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_settlement — the multi-invoice, deduction-aware payment entry point.
-- ---------------------------------------------------------------------------
create or replace function public.create_settlement(
  p_id text,
  p_payment_no text,
  p_date date,
  p_company_id text,
  p_amount numeric,
  p_method payment_method,
  p_reference text,
  p_notes text,
  p_allocations jsonb,   -- [{ id, invoice_id, amount }]
  p_deductions jsonb     -- [{ id, invoice_id, deduction_type, calc_type, rate, amount, reference, remarks }]
) returns setof public.payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor       text := nullif(auth.jwt() ->> 'email', '');
  v_alloc       jsonb;
  v_ded         jsonb;
  v_alloc_sum   numeric := 0;
  v_alloc_count int := coalesce(jsonb_array_length(p_allocations), 0);
  v_inv_company text;
  v_inv_status  invoice_status;
  v_outstanding numeric;
  rec           record;
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  -- 1. Validate allocations (customer match, not cancelled, positive) + sum.
  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    if (v_alloc ->> 'amount')::numeric <= 0 then
      raise exception 'Allocation amount must be greater than zero';
    end if;
    select company_id, status into v_inv_company, v_inv_status
      from public.invoices where id = v_alloc ->> 'invoice_id';
    if not found then
      raise exception 'Invoice % not found', v_alloc ->> 'invoice_id';
    end if;
    if v_inv_company <> p_company_id then
      raise exception 'Invoice % belongs to a different customer', v_alloc ->> 'invoice_id';
    end if;
    if v_inv_status = 'Cancelled' then
      raise exception 'Cannot settle a cancelled invoice (%)', v_alloc ->> 'invoice_id';
    end if;
    v_alloc_sum := v_alloc_sum + (v_alloc ->> 'amount')::numeric;
  end loop;

  -- Cannot apply more bank money to invoices than was actually received.
  if v_alloc_sum > p_amount + 0.001 then
    raise exception 'Allocated (%) exceeds amount received (%)', v_alloc_sum, p_amount;
  end if;

  -- 2. Insert the payment header. invoice_id stays NULL — allocations are the
  --    source of truth; is_advance marks a wholly unallocated (on-account) receipt.
  insert into public.payments
    (id, payment_no, date, company_id, invoice_id, amount, method, reference, is_advance, notes)
  values
    (p_id, p_payment_no, p_date, p_company_id, null, p_amount, p_method, p_reference,
     (v_alloc_count = 0), p_notes);

  -- 3. Insert allocations.
  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.payment_allocations (id, payment_id, invoice_id, amount, created_by)
    values (v_alloc ->> 'id', p_id, v_alloc ->> 'invoice_id', (v_alloc ->> 'amount')::numeric, v_actor);
  end loop;

  -- 4. Insert deductions (optional; includes 'Unidentified' unknown-difference rows).
  for v_ded in select * from jsonb_array_elements(coalesce(p_deductions, '[]'::jsonb)) loop
    if (v_ded ->> 'amount')::numeric < 0 then
      raise exception 'Deduction amount cannot be negative';
    end if;
    insert into public.payment_deductions
      (id, payment_id, invoice_id, deduction_type, calc_type, rate, amount, reference, remarks, created_by, updated_by)
    values
      (v_ded ->> 'id', p_id, nullif(v_ded ->> 'invoice_id', ''),
       v_ded ->> 'deduction_type', coalesce(nullif(v_ded ->> 'calc_type', ''), 'fixed'),
       (v_ded ->> 'rate')::numeric, (v_ded ->> 'amount')::numeric,
       nullif(v_ded ->> 'reference', ''), nullif(v_ded ->> 'remarks', ''), v_actor, v_actor);
  end loop;

  -- 5. Over-settlement guard + status recompute per touched invoice. invoice_totals
  --    already reflects the rows inserted above (same transaction), so a negative
  --    outstanding means alloc + deductions exceeded what the invoice owed.
  for rec in
    select distinct inv from (
      select invoice_id as inv from public.payment_allocations where payment_id = p_id
      union
      select invoice_id from public.payment_deductions where payment_id = p_id and invoice_id is not null
    ) t
  loop
    select outstanding into v_outstanding from public.invoice_totals where invoice_id = rec.inv;
    if coalesce(v_outstanding, 0) < -0.001 then
      raise exception 'Invoice % over-settled by % (allocation + deductions exceed outstanding)',
        rec.inv, -v_outstanding;
    end if;
    perform public.recompute_invoice_status(rec.inv);
  end loop;

  -- 6. Audit trail — financial records must be attributable (actor from JWT).
  perform public.hr_log(
    'create', 'payment', p_id,
    format('Settlement %s — %s received via %s', p_payment_no, p_amount, p_method),
    null,
    jsonb_build_object('amount', p_amount, 'allocations', p_allocations, 'deductions', p_deductions),
    p_company_id, null);

  -- 7. GL SEAM (future phase): a balanced journal (Dr Bank + Dr TDS/Freight/…,
  --    Cr AR) can be posted here via post_journal() without changing anything
  --    above. Intentionally GL-neutral for now.

  return query select * from public.payments where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_payment — unchanged contract; status recompute delegated to the helper.
-- (Behavior identical: no deductions ⇒ settled == paid ⇒ Unpaid/Partially/Paid.)
-- ---------------------------------------------------------------------------
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

  if p_invoice_id is not null then
    perform public.recompute_invoice_status(p_invoice_id);
  end if;

  return query select * from public.payments where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_payment — multi-invoice aware. Gathers every invoice the payment
-- touched (direct link + allocations + deductions), deletes the payment (rows in
-- payment_allocations/payment_deductions cascade), then recomputes each. Still
-- idempotent and SECURITY INVOKER.
-- ---------------------------------------------------------------------------
create or replace function public.delete_payment(p_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoices text[];
  v_inv      text;
  v_before   jsonb;
  v_company  text;
begin
  select to_jsonb(p.*), p.company_id into v_before, v_company
    from public.payments p where p.id = p_id;
  if not found then return; end if;

  select array(
    select distinct inv from (
      select invoice_id as inv from public.payments where id = p_id and invoice_id is not null
      union
      select invoice_id from public.payment_allocations where payment_id = p_id
      union
      select invoice_id from public.payment_deductions where payment_id = p_id and invoice_id is not null
    ) t
  ) into v_invoices;

  delete from public.payments where id = p_id;  -- cascades allocations + deductions

  foreach v_inv in array coalesce(v_invoices, array[]::text[]) loop
    perform public.recompute_invoice_status(v_inv);
  end loop;

  -- Audit trail — preserve the deleted financial record.
  perform public.hr_log('delete', 'payment', p_id, 'Payment deleted', v_before, null, v_company, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_invoice_status — cancel guard now blocks on ANY settlement activity, so a
-- deduction-only or multi-invoice-allocated invoice can't be silently cancelled.
-- ---------------------------------------------------------------------------
create or replace function public.set_invoice_status(p_id text, p_status invoice_status)
returns setof public.invoices
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_settled numeric;
  v_has_rows boolean;
begin
  perform 1 from public.invoices where id = p_id;
  if not found then raise exception 'Invoice not found'; end if;

  if p_status = 'Cancelled' then
    select settled into v_settled from public.invoice_totals where invoice_id = p_id;
    select exists(select 1 from public.payment_allocations where invoice_id = p_id)
        or exists(select 1 from public.payment_deductions  where invoice_id = p_id)
        or exists(select 1 from public.payments where invoice_id = p_id)
      into v_has_rows;
    if coalesce(v_settled, 0) > 0 or v_has_rows then
      raise exception 'Invoice has payments or deductions recorded. Remove them before cancelling.';
    end if;
    update public.delivery_challans set status = 'Open', invoice_id = null, updated_at = now()
      where invoice_id = p_id;
  end if;

  update public.invoices set status = p_status, updated_at = now() where id = p_id;
  return query select * from public.invoices where id = p_id;
end;
$$;

grant execute on function public.recompute_invoice_status(text) to authenticated;
grant execute on function public.create_settlement(text, text, date, text, numeric, payment_method, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.create_payment(text, text, date, text, text, numeric, payment_method, text, boolean, text) to authenticated;
grant execute on function public.delete_payment(text) to authenticated;
grant execute on function public.set_invoice_status(text, invoice_status) to authenticated;
