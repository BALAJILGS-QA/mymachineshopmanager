-- ============================================================================
-- Phase 6 - Delivery-challan reopen RPC + edit/delete guard triggers
-- ============================================================================
-- Ports dcRepo.reopen plus the "invoiced challan cannot be edited/deleted" guards
-- from repo.ts. setStatus is a plain update (no rule) so the client does it
-- directly. SECURITY INVOKER. Idempotent. Additive. No DROP/TRUNCATE.
-- ============================================================================

-- Recover a challan stuck "Invoiced" whose invoice is gone/cancelled. Refuses
-- while a live (non-cancelled) invoice still links it.
create or replace function public.reopen_challan(p_id text)
returns setof public.delivery_challans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv_id     text;
  v_inv_status invoice_status;
begin
  select invoice_id into v_inv_id from public.delivery_challans where id = p_id;
  if not found then raise exception 'Delivery challan not found'; end if;

  if v_inv_id is not null then
    select status into v_inv_status from public.invoices where id = v_inv_id;
    if found and v_inv_status <> 'Cancelled' then
      raise exception 'Challan is billed on a live invoice. Cancel the invoice first.';
    end if;
  end if;

  update public.delivery_challans set status = 'Open', invoice_id = null, updated_at = now()
    where id = p_id;
  return query select * from public.delivery_challans where id = p_id;
end;
$$;

grant execute on function public.reopen_challan(text) to authenticated;

-- Guard: an invoiced challan may not be deleted, and its line items may not be
-- edited (status transitions like cancel->Open are still allowed).
create or replace function public.dc_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if old.status = 'Invoiced' then
      raise exception 'Challan is invoiced. Cancel it instead of deleting.';
    end if;
    return old;
  end if;
  -- UPDATE
  if old.status = 'Invoiced' and new.lines is distinct from old.lines then
    raise exception 'Cannot edit items on an invoiced challan';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dc_guard on public.delivery_challans;
create trigger trg_dc_guard
  before update or delete on public.delivery_challans
  for each row execute function public.dc_guard();
