-- ============================================================================
-- Supply chain: vendors master + subcontracting (job-work) workflow
-- ============================================================================
-- vendors: supplier/subcontractor master (also used for Purchase Management).
-- subcontract_orders: a quantity of a material (customer- or shop-owned) sent to
-- a vendor for job work. subcontract_docs: the paperwork — OUR outward delivery
-- challan (direction OUT) and the vendor's return challan/invoice (direction IN).
--
-- Stock model ("material stays ours, just moves"): the outward DC posts a stock
-- ISSUE (reference SUBCONTRACT_OUT) that lowers on-hand; the "At Vendor" balance
-- is derived as sent - returned in the app. The return posts a stock RECEIPT that
-- brings the processed quantity back on-hand. A vendor INVOICE additionally logs a
-- job-work expense. All movements reuse the existing receipts/issues ledger.
-- SECURITY INVOKER. Idempotent. Additive.
-- ============================================================================

create table if not exists public.vendors (
  id text primary key,
  code text not null unique,
  name text not null,
  gstin text,
  phone text,
  email text,
  address text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vendors enable row level security;
drop policy if exists approved_all on public.vendors;
create policy approved_all on public.vendors for all to authenticated
  using (public.is_app_approved()) with check (public.is_app_approved());

create table if not exists public.subcontract_orders (
  id text primary key,
  sc_no text not null unique,
  date date not null,
  vendor_id text not null references public.vendors(id),
  material_id text not null references public.materials(id),
  owner_type text not null,                     -- 'Company' | 'Shop' (material source)
  company_id text references public.companies(id),
  job_id text references public.job_orders(id), -- optional link to a shop job
  process text,                                 -- the job work to be done
  unit text not null,
  sent_qty numeric(14,3) not null default 0,
  received_qty numeric(14,3) not null default 0,
  rejected_qty numeric(14,3) not null default 0,
  status text not null default 'Open',          -- Open|Sent|Partially Received|Received
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sc_vendor on public.subcontract_orders (vendor_id);
create index if not exists idx_sc_material on public.subcontract_orders (material_id);
alter table public.subcontract_orders enable row level security;
drop policy if exists approved_all on public.subcontract_orders;
create policy approved_all on public.subcontract_orders for all to authenticated
  using (public.is_app_approved()) with check (public.is_app_approved());

create table if not exists public.subcontract_docs (
  id text primary key,
  doc_no text not null,
  sc_id text not null references public.subcontract_orders(id) on delete cascade,
  direction text not null,                      -- 'OUT' (our DC) | 'IN' (vendor)
  doc_kind text not null,                       -- 'DC' | 'INVOICE'
  vendor_ref text,                              -- vendor's DC / invoice number (IN)
  date date not null,
  quantity numeric(14,3) not null check (quantity > 0),
  rejected numeric(14,3) not null default 0,
  unit text not null,
  amount numeric(14,2),                         -- job-work charge on a vendor invoice
  expense_id text references public.expenses(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_scdoc_order on public.subcontract_docs (sc_id);
alter table public.subcontract_docs enable row level security;
drop policy if exists approved_all on public.subcontract_docs;
create policy approved_all on public.subcontract_docs for all to authenticated
  using (public.is_app_approved()) with check (public.is_app_approved());

-- Recompute an order's status from its quantities.
create or replace function public.sc_status(p_sent numeric, p_recd numeric, p_rej numeric)
returns text language sql immutable as $$
  select case
    when coalesce(p_sent,0) = 0 then 'Open'
    when coalesce(p_recd,0) + coalesce(p_rej,0) >= coalesce(p_sent,0) then 'Received'
    else 'Partially Received' end;
$$;

-- Outward: send material to the vendor on our delivery challan (deducts on-hand).
create or replace function public.create_subcontract_dispatch(
  p_doc_id text, p_doc_no text, p_sc_id text, p_date date,
  p_quantity numeric, p_notes text, p_issue_id text, p_issue_no text
) returns setof public.subcontract_orders
language plpgsql security invoker set search_path = public
as $$
declare
  v_mat_id text; v_owner text; v_company text; v_unit text;
  v_scope text; v_available numeric; v_allow_neg boolean; v_mat_name text;
begin
  select material_id, owner_type, company_id, unit
    into v_mat_id, v_owner, v_company, v_unit
    from subcontract_orders where id = p_sc_id;
  if not found then raise exception 'Subcontract order not found'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  v_scope := case when v_owner = 'Company' then v_company else null end;
  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from app_state where id = 'singleton';
  perform pg_advisory_xact_lock(hashtext(v_mat_id || ':' || coalesce(v_scope, 'shop')));
  v_available := public.material_balance(v_mat_id, v_scope);
  if not coalesce(v_allow_neg, false) and p_quantity > v_available then
    select name into v_mat_name from materials where id = v_mat_id;
    raise exception 'Insufficient stock for "%": available % %, requested %.',
      v_mat_name, v_available, v_unit, p_quantity;
  end if;

  insert into subcontract_docs (id, doc_no, sc_id, direction, doc_kind, date, quantity, unit, notes)
  values (p_doc_id, p_doc_no, p_sc_id, 'OUT', 'DC', p_date, p_quantity, v_unit, p_notes);

  insert into material_issues (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note, reference_type, reference_id)
  values (p_issue_id, p_issue_no, p_date, v_mat_id, null, v_scope, p_quantity, v_unit,
          'Sent to vendor (subcontract) ' || p_doc_no, 'SUBCONTRACT_OUT', p_doc_id);

  update subcontract_orders
    set sent_qty = sent_qty + p_quantity,
        status = case when status = 'Open' then 'Sent' else status end,
        updated_at = now()
    where id = p_sc_id;

  return query select * from subcontract_orders where id = p_sc_id;
end;
$$;

-- Inward: vendor returns processed material on their DC/invoice against our DC.
-- Good quantity comes back to on-hand; an invoice also logs a job-work expense.
create or replace function public.create_subcontract_return(
  p_doc_id text, p_doc_no text, p_sc_id text, p_date date,
  p_doc_kind text, p_vendor_ref text, p_quantity numeric, p_rejected numeric,
  p_amount numeric, p_method payment_method, p_notes text,
  p_receipt_id text, p_receipt_no text, p_expense_id text, p_expense_no text
) returns setof public.subcontract_orders
language plpgsql security invoker set search_path = public
as $$
declare
  v_mat_id text; v_owner text; v_company text; v_unit text;
  v_scope text; v_vendor text; v_vname text; v_sent numeric; v_recd numeric; v_rej numeric;
begin
  select material_id, owner_type, company_id, unit, vendor_id, sent_qty, received_qty, rejected_qty
    into v_mat_id, v_owner, v_company, v_unit, v_vendor, v_sent, v_recd, v_rej
    from subcontract_orders where id = p_sc_id;
  if not found then raise exception 'Subcontract order not found'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Returned quantity must be greater than zero'; end if;

  v_scope := case when v_owner = 'Company' then v_company else null end;

  insert into subcontract_docs (id, doc_no, sc_id, direction, doc_kind, vendor_ref, date, quantity, rejected, unit, amount, notes, expense_id)
  values (p_doc_id, p_doc_no, p_sc_id, 'IN', coalesce(p_doc_kind, 'DC'), p_vendor_ref, p_date,
          p_quantity, coalesce(p_rejected, 0), v_unit, p_amount, p_notes,
          case when coalesce(p_doc_kind,'DC') = 'INVOICE' and coalesce(p_amount,0) > 0 then p_expense_id else null end);

  -- Good quantity returns to on-hand (rejected/scrap does not).
  insert into material_receipts (id, receipt_no, date, material_id, owner_type, company_id, supplier, quantity, unit, reference, notes)
  values (p_receipt_id, p_receipt_no, p_date, v_mat_id, v_owner, v_scope,
          (select name from vendors where id = v_vendor), p_quantity, v_unit,
          'SUBCONTRACT_IN', 'Returned from vendor (subcontract) ' || p_doc_no);

  -- Vendor invoice → job-work expense.
  if coalesce(p_doc_kind, 'DC') = 'INVOICE' and coalesce(p_amount, 0) > 0 then
    select name into v_vname from vendors where id = v_vendor;
    insert into expenses (id, expense_no, date, category, amount, method, vendor, reference, notes)
    values (p_expense_id, p_expense_no, p_date, 'Job Work Charges', p_amount, coalesce(p_method, 'Cash'),
            v_vname, p_vendor_ref, 'Subcontract ' || p_doc_no);
  end if;

  update subcontract_orders
    set received_qty = received_qty + p_quantity,
        rejected_qty = rejected_qty + coalesce(p_rejected, 0),
        status = public.sc_status(v_sent, v_recd + p_quantity, v_rej + coalesce(p_rejected, 0)),
        updated_at = now()
    where id = p_sc_id;

  return query select * from subcontract_orders where id = p_sc_id;
end;
$$;

grant execute on function public.sc_status(numeric, numeric, numeric) to authenticated;
grant execute on function public.create_subcontract_dispatch(text, text, text, date, numeric, text, text, text) to authenticated;
grant execute on function public.create_subcontract_return(text, text, text, date, text, text, numeric, numeric, numeric, payment_method, text, text, text, text, text) to authenticated;
