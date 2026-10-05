-- 0067_job_planned_qty.sql
--
-- Production planning: add a "planned production quantity" to job orders.
-- STRICTLY ADDITIVE. It does NOT touch create_job, the material auto-issue, the
-- material_balance RPC, material_receipt_stock, or any inventory/stock logic — so
-- existing inventory functionality is unaffected.
--
-- planned_qty defaults to ordered_qty via a BEFORE trigger, so the existing
-- create_job RPC (which does not set planned_qty) keeps working unchanged; the
-- frontend can still override it afterwards via the normal job update path.
-- Idempotent.

alter table public.job_orders
  add column if not exists planned_qty numeric;

-- Backfill existing rows.
update public.job_orders
   set planned_qty = ordered_qty
 where planned_qty is null;

create or replace function public.job_default_planned_qty()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.planned_qty is null then
    new.planned_qty := new.ordered_qty;
  end if;
  if new.planned_qty < 0 then
    new.planned_qty := 0;
  end if;
  return new;
end $$;

drop trigger if exists trg_job_default_planned_qty on public.job_orders;
create trigger trg_job_default_planned_qty
  before insert or update on public.job_orders
  for each row execute function public.job_default_planned_qty();
