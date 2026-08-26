-- ============================================================================
-- Phase 6 - delete_payment RPC (recompute invoice status on removal)
-- ============================================================================
-- Ports paymentRepo.remove: deleting a payment recomputes the linked invoice's
-- status. SECURITY INVOKER. Idempotent. Additive. No DROP/TRUNCATE.
-- ============================================================================

create or replace function public.delete_payment(p_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_id text;
  v_status     invoice_status;
  v_total      numeric;
  v_paid       numeric;
begin
  select invoice_id into v_invoice_id from public.payments where id = p_id;
  if not found then return; end if;

  delete from public.payments where id = p_id;

  if v_invoice_id is not null then
    select status into v_status from public.invoices where id = v_invoice_id;
    if v_status is not null and v_status not in ('Draft', 'Cancelled') then
      select total, paid into v_total, v_paid from public.invoice_totals where invoice_id = v_invoice_id;
      update public.invoices set
        status = case
          when coalesce(v_paid, 0) <= 0 then 'Unpaid'::invoice_status
          when coalesce(v_paid, 0) + 0.001 < coalesce(v_total, 0) then 'Partially Paid'::invoice_status
          else 'Paid'::invoice_status end,
        updated_at = now()
      where id = v_invoice_id;
    end if;
  end if;
end;
$$;

grant execute on function public.delete_payment(text) to authenticated;
