-- ============================================================================
-- Invoice Payment & Settlement — part 4: allocate an existing advance.
-- ============================================================================
-- Depends on 0056 (payment_allocations) + 0057 (recompute_invoice_status).
--
-- allocate_advance(payment_id, allocations[]) applies an already-recorded
-- advance / on-account receipt to one or more invoices by INSERTing allocation
-- rows against the existing payment (it does not create a new payment). Guards:
--   • new allocations may not exceed the payment's unallocated remainder
--     (amount − Σ existing allocations),
--   • each target invoice must belong to the payment's customer and not be
--     Cancelled,
--   • no invoice may end up over-settled.
-- When the payment becomes fully allocated its is_advance flag is cleared.
-- Each touched invoice's status is recomputed. SECURITY INVOKER. Additive.
-- ============================================================================

create or replace function public.allocate_advance(
  p_payment_id text,
  p_allocations jsonb   -- [{ id, invoice_id, amount }]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor        text := nullif(auth.jwt() ->> 'email', '');
  v_company      text;
  v_amount       numeric;
  v_allocated    numeric;
  v_new_sum      numeric := 0;
  v_alloc        jsonb;
  v_inv_company  text;
  v_inv_status   invoice_status;
  v_outstanding  numeric;
  rec            record;
begin
  select company_id, amount into v_company, v_amount
    from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;

  select coalesce(sum(amount), 0) into v_allocated
    from public.payment_allocations where payment_id = p_payment_id;

  -- Validate each new allocation + accumulate.
  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    if (v_alloc ->> 'amount')::numeric <= 0 then
      raise exception 'Allocation amount must be greater than zero';
    end if;
    select company_id, status into v_inv_company, v_inv_status
      from public.invoices where id = v_alloc ->> 'invoice_id';
    if not found then
      raise exception 'Invoice % not found', v_alloc ->> 'invoice_id';
    end if;
    if v_inv_company <> v_company then
      raise exception 'Invoice % belongs to a different customer', v_alloc ->> 'invoice_id';
    end if;
    if v_inv_status = 'Cancelled' then
      raise exception 'Cannot settle a cancelled invoice (%)', v_alloc ->> 'invoice_id';
    end if;
    v_new_sum := v_new_sum + (v_alloc ->> 'amount')::numeric;
  end loop;

  if v_allocated + v_new_sum > v_amount + 0.001 then
    raise exception 'Allocations (%) exceed the payment amount (%)', v_allocated + v_new_sum, v_amount;
  end if;

  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.payment_allocations (id, payment_id, invoice_id, amount, created_by)
    values (v_alloc ->> 'id', p_payment_id, v_alloc ->> 'invoice_id', (v_alloc ->> 'amount')::numeric, v_actor);
  end loop;

  -- Clear the advance flag once fully applied.
  if v_allocated + v_new_sum + 0.001 >= v_amount then
    update public.payments set is_advance = false, updated_at = now() where id = p_payment_id;
  end if;

  -- Over-settlement guard + status recompute per touched invoice.
  for rec in
    select distinct invoice_id as inv from public.payment_allocations where payment_id = p_payment_id
  loop
    select outstanding into v_outstanding from public.invoice_totals where invoice_id = rec.inv;
    if coalesce(v_outstanding, 0) < -0.001 then
      raise exception 'Invoice % over-settled by %', rec.inv, -v_outstanding;
    end if;
    perform public.recompute_invoice_status(rec.inv);
  end loop;

  -- Audit trail.
  perform public.hr_log(
    'allocate', 'payment', p_payment_id,
    format('Advance of %s applied to invoices', v_new_sum),
    null, p_allocations, v_company, null);
end;
$$;

grant execute on function public.allocate_advance(text, jsonb) to authenticated;
