-- ============================================================================
-- Invoice Payment & Settlement — part 5: reclassify an unknown difference.
-- ============================================================================
-- Depends on 0056 (payment_deductions) + 0057 (recompute_invoice_status) +
-- 0019 (hr_log audit).
--
-- reclassify_deduction(payment_id, invoice_id, splits[]) converts the
-- 'Unidentified' shortfall recorded against an invoice into known deduction
-- types (TDS / Transportation / …). The split total MUST equal the unidentified
-- amount, so the invoice's settled/outstanding — and therefore its status — do
-- NOT change; only the *classification* does. Both states are captured in
-- hr_audit_log (before = the unknown rows, after = the splits) so the history is
-- preserved, as the spec requires. Atomic. SECURITY INVOKER. Additive.
-- ============================================================================

create or replace function public.reclassify_deduction(
  p_payment_id text,
  p_invoice_id text,
  p_splits jsonb   -- [{ id, deduction_type, calc_type, rate, amount, reference, remarks }]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor     text := nullif(auth.jwt() ->> 'email', '');
  v_company   text;
  v_unknown   numeric;
  v_split_sum numeric := 0;
  v_before    jsonb;
  v_split     jsonb;
begin
  -- Sum the unidentified difference on this payment+invoice.
  select coalesce(sum(amount), 0) into v_unknown
    from public.payment_deductions
   where payment_id = p_payment_id and invoice_id = p_invoice_id
     and deduction_type = 'Unidentified';

  if v_unknown <= 0 then
    raise exception 'No unidentified difference to reclassify for this payment/invoice';
  end if;

  -- Validate the splits: all known types, non-negative, and total to the unknown.
  for v_split in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    if (v_split ->> 'deduction_type') = 'Unidentified' then
      raise exception 'Reclassified deductions must be a known type, not Unidentified';
    end if;
    if (v_split ->> 'amount')::numeric < 0 then
      raise exception 'Deduction amount cannot be negative';
    end if;
    v_split_sum := v_split_sum + (v_split ->> 'amount')::numeric;
  end loop;

  if abs(v_split_sum - v_unknown) > 0.001 then
    raise exception 'Reclassified total (%) must equal the unidentified difference (%)',
      v_split_sum, v_unknown;
  end if;

  -- Snapshot the before-state for the audit trail.
  select jsonb_agg(to_jsonb(d)) into v_before
    from public.payment_deductions d
   where d.payment_id = p_payment_id and d.invoice_id = p_invoice_id
     and d.deduction_type = 'Unidentified';

  -- Replace the unknown rows with the known splits.
  delete from public.payment_deductions
   where payment_id = p_payment_id and invoice_id = p_invoice_id
     and deduction_type = 'Unidentified';

  for v_split in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) loop
    insert into public.payment_deductions
      (id, payment_id, invoice_id, deduction_type, calc_type, rate, amount, reference, remarks, created_by, updated_by)
    values
      (v_split ->> 'id', p_payment_id, p_invoice_id,
       v_split ->> 'deduction_type', coalesce(nullif(v_split ->> 'calc_type', ''), 'fixed'),
       (v_split ->> 'rate')::numeric, (v_split ->> 'amount')::numeric,
       nullif(v_split ->> 'reference', ''), nullif(v_split ->> 'remarks', ''), v_actor, v_actor);
  end loop;

  -- Audit both states (company from the payment).
  select company_id into v_company from public.payments where id = p_payment_id;
  perform public.hr_log(
    'reclassify', 'payment_deduction', p_payment_id,
    format('Reclassified unidentified difference of %s on invoice %s', v_unknown, p_invoice_id),
    v_before, p_splits, v_company,
    jsonb_build_object('invoice_id', p_invoice_id));

  -- Settled is unchanged, but recompute defensively.
  perform public.recompute_invoice_status(p_invoice_id);
end;
$$;

grant execute on function public.reclassify_deduction(text, text, jsonb) to authenticated;
