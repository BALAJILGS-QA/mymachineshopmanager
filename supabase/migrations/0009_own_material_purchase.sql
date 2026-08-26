-- ============================================================================
-- Inventory redesign - Phase 1c: own-material purchase (stock + expense, atomic)
-- ============================================================================
-- own_material_purchases records a purchase of the shop's OWN raw material with
-- cost + GST. create_own_material_purchase atomically: (1) inserts a Shop-owned
-- stock receipt (the +qty), (2) inserts a linked Expense (amount = cost + GST),
-- (3) inserts the purchase row linking both. One transaction -> no orphan stock
-- or expense; idempotent via client-generated ids. SECURITY INVOKER. Additive.
-- ============================================================================

create table if not exists public.own_material_purchases (
  id           text primary key,
  supplier     text,
  material_id  text not null references public.materials(id),
  purchase_date date not null,
  quantity     numeric(14,3) not null check (quantity > 0),
  unit         text not null,
  total_cost   numeric(14,2) not null default 0 check (total_cost >= 0),
  total_gst    numeric(14,2) not null default 0 check (total_gst >= 0),
  total_amount numeric(14,2) not null default 0,
  notes        text,
  receipt_id   text references public.material_receipts(id),
  expense_id   text references public.expenses(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_own_purchase_material on public.own_material_purchases (material_id);

alter table public.own_material_purchases enable row level security;
drop policy if exists approved_all on public.own_material_purchases;
create policy approved_all on public.own_material_purchases for all to authenticated
  using (public.is_app_approved()) with check (public.is_app_approved());

create or replace function public.create_own_material_purchase(
  p_id text, p_supplier text, p_material_id text, p_purchase_date date,
  p_quantity numeric, p_unit text, p_total_cost numeric, p_total_gst numeric,
  p_notes text, p_method payment_method,
  p_receipt_id text, p_receipt_no text, p_expense_id text, p_expense_no text
) returns setof public.own_material_purchases
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total numeric;
  v_rate  numeric;
begin
  if not exists (select 1 from materials where id = p_material_id) then
    raise exception 'Select a valid material';
  end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if coalesce(p_total_cost, 0) < 0 or coalesce(p_total_gst, 0) < 0 then
    raise exception 'Cost and GST cannot be negative';
  end if;

  v_total := coalesce(p_total_cost, 0) + coalesce(p_total_gst, 0);
  v_rate  := round(coalesce(p_total_cost, 0) / p_quantity, 2);

  -- Own (shop) stock receipt: the +qty.
  insert into material_receipts (id, receipt_no, date, material_id, owner_type, company_id,
    supplier, quantity, unit, rate, reference, notes)
  values (p_receipt_id, p_receipt_no, p_purchase_date, p_material_id, 'Shop', null,
    p_supplier, p_quantity, p_unit, v_rate, 'OWN_PURCHASE', p_notes);

  -- Linked expense: total paid (cost + GST). Breakdown kept on the purchase row.
  insert into expenses (id, expense_no, date, category, amount, method, vendor, reference, notes)
  values (p_expense_id, p_expense_no, p_purchase_date, 'Material Purchase', v_total, p_method,
    p_supplier, 'OWN_PURCHASE',
    'Material cost ' || coalesce(p_total_cost, 0) || ' + GST ' || coalesce(p_total_gst, 0));

  insert into public.own_material_purchases (id, supplier, material_id, purchase_date, quantity,
    unit, total_cost, total_gst, total_amount, notes, receipt_id, expense_id)
  values (p_id, p_supplier, p_material_id, p_purchase_date, p_quantity, p_unit,
    coalesce(p_total_cost, 0), coalesce(p_total_gst, 0), v_total, p_notes, p_receipt_id, p_expense_id);

  return query select * from public.own_material_purchases where id = p_id;
end;
$$;

grant execute on function public.create_own_material_purchase(text, text, text, date, numeric, text, numeric, numeric, text, payment_method, text, text, text, text) to authenticated;
