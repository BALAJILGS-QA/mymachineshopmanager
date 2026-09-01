-- ============================================================================
-- Source-wise stock allocation: dispatch consumes a SPECIFIC received stock
-- ============================================================================
-- Until now stock was tracked per (material, company-scope): material_balance()
-- merged EVERY receipt of a material for an owner into one pool, so two intakes
-- of the same material (MC-001 and MC-002) were indistinguishable and a dispatch
-- deducted from the merged pool. The business needs each received quantity to be
-- individually traceable and reduced only when THAT stock is dispatched.
--
-- This migration makes a dispatch (delivery challan OR invoice) consume a
-- specific source receipt:
--   * material_issues / stock_adjustments gain source_receipt_id (the received
--     stock they draw from). Nullable -> legacy/aggregate movements still work.
--   * receipt_available(receipt) = received - issues(from it) + adjustments(to it)
--     is the per-source available quantity — the single source of truth.
--   * material_receipt_stock view exposes per-receipt Received / DC / Invoice /
--     Total Dispatched / Available / Status for the stock grid + dispatch picker.
--   * The dispatch RPCs (challan + invoice, create + edit + cancel) allocate,
--     stock-check and reverse PER SOURCE, advisory-locked on the receipt id so
--     two concurrent dispatches can never over-consume one source (no negative,
--     no over-dispatch). A line WITHOUT source_receipt_id keeps the old
--     aggregate behaviour (backward compatible; the UI supplies a source for
--     every customer/own stock line going forward).
--
-- SECURITY INVOKER. Idempotent (create or replace / if not exists). Additive —
-- no data dropped, no TRUNCATE.
-- ============================================================================

-- ---------- 1. Source linkage columns ---------------------------------------
alter table public.material_issues
  add column if not exists source_receipt_id text references public.material_receipts(id);
alter table public.stock_adjustments
  add column if not exists source_receipt_id text references public.material_receipts(id);

create index if not exists idx_issues_source_receipt
  on public.material_issues (source_receipt_id);
create index if not exists idx_adjustments_source_receipt
  on public.stock_adjustments (source_receipt_id);

-- Invoice lines record which source stock they dispatched (traceability).
alter table public.invoice_lines
  add column if not exists source_receipt_id text references public.material_receipts(id);

-- One document could legitimately dispatch the SAME material from two different
-- source receipts (two issues, same reference + material). Replace the old
-- (reference_type, reference_id, material_id) idempotency guard with one that
-- also keys on the source receipt so per-source rows coexist.
drop index if exists public.uq_issue_reference_material;
create unique index if not exists uq_issue_reference_material_source
  on public.material_issues (reference_type, reference_id, material_id, coalesce(source_receipt_id, ''))
  where reference_type is not null;

-- ---------- 2. Per-source available -----------------------------------------
-- Available of ONE received stock = its received quantity minus everything ever
-- dispatched from it plus any adjustment booked against it. Never merges other
-- receipts of the same material — that is the whole point.
create or replace function public.receipt_available(p_receipt_id text)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select
      coalesce((select quantity from material_receipts where id = p_receipt_id), 0)
    - coalesce((select sum(quantity) from material_issues    where source_receipt_id = p_receipt_id), 0)
    + coalesce((select sum(quantity) from stock_adjustments  where source_receipt_id = p_receipt_id), 0);
$$;
grant execute on function public.receipt_available(text) to authenticated;

-- ---------- 3. Per-source stock grid view -----------------------------------
-- One row per received stock (customer intake or own purchase) with the split
-- the Material Stock grid needs: Received / DC Qty / Invoice Qty / Total
-- Dispatched / Available / Status. Available <= 0 => Fully Dispatched.
create or replace view public.material_receipt_stock as
select
  r.id                                     as receipt_id,
  r.receipt_no,
  r.date,
  r.material_id,
  r.company_id,
  r.owner_type,
  case when r.company_id is null then 'Shop' else 'Company' end as ownership,
  r.reference                              as source_doc_no,
  r.supplier,
  r.unit,
  r.quantity                               as received,
  coalesce((select sum(i.quantity) from material_issues i
            where i.source_receipt_id = r.id and i.reference_type = 'DELIVERY_CHALLAN'), 0) as dc_qty,
  coalesce((select sum(i.quantity) from material_issues i
            where i.source_receipt_id = r.id and i.reference_type = 'INVOICE'), 0)          as invoice_qty,
  coalesce((select sum(i.quantity) from material_issues i
            where i.source_receipt_id = r.id
              and coalesce(i.reference_type, '') not in ('DELIVERY_CHALLAN', 'INVOICE')), 0) as other_out,
  coalesce((select sum(i.quantity) from material_issues i where i.source_receipt_id = r.id), 0)    as total_dispatched,
  coalesce((select sum(a.quantity) from stock_adjustments a where a.source_receipt_id = r.id), 0)  as adjusted,
  public.receipt_available(r.id)           as available,
  case when public.receipt_available(r.id) <= 0 then 'Fully Dispatched' else 'Available' end as status
from public.material_receipts r;
grant select on public.material_receipt_stock to authenticated;

-- ---------- 4. Shared source validation + check -----------------------------
-- Validates a source receipt against the line's material + owner scope, locks it
-- for the transaction and rejects an over-dispatch. Returns nothing; raises on
-- any violation. p_scope is the line's owner scope (company id, or null = shop).
create or replace function public.assert_source_dispatchable(
  p_receipt_id text, p_material_id text, p_scope text, p_qty numeric,
  p_unit text, p_allow_neg boolean
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rcp_mat   text;
  v_rcp_scope text;
  v_doc       text;
  v_available numeric;
begin
  select material_id,
         case when owner_type = 'Company' then company_id else null end,
         coalesce(reference, receipt_no)
    into v_rcp_mat, v_rcp_scope, v_doc
    from public.material_receipts where id = p_receipt_id;
  if not found then
    raise exception 'Selected source stock no longer exists';
  end if;
  if v_rcp_mat <> p_material_id then
    raise exception 'Source stock % is a different material', v_doc;
  end if;
  if v_rcp_scope is distinct from p_scope then
    raise exception 'Source stock % belongs to a different owner', v_doc;
  end if;

  -- Serialise concurrent dispatches of the SAME source (per-receipt lock).
  perform pg_advisory_xact_lock(hashtext('rcp:' || p_receipt_id));
  v_available := public.receipt_available(p_receipt_id);
  if not coalesce(p_allow_neg, false) and p_qty > v_available then
    raise exception 'Cannot dispatch % %. Only % % are available for this material source (%).',
      p_qty, p_unit, v_available, p_unit, v_doc;
  end if;
end;
$$;
grant execute on function public.assert_source_dispatchable(text, text, text, numeric, text, boolean) to authenticated;

-- ---------- 5. Delivery challan: create (source-aware) -----------------------
-- Line shape (jsonb): { id, materialId, ownerType('Company'|'Shop'), quantity,
-- unit, description?, jobId?, sourceReceiptId? }. When sourceReceiptId is set the
-- dispatch consumes THAT received stock (per-source lock + check); otherwise it
-- falls back to the aggregate (material, scope) pool for backward compatibility.
create or replace function public.create_challan_with_dispatch(
  p_id text, p_dc_no text, p_date date, p_company_id text, p_job_id text,
  p_reference text, p_vehicle_no text, p_notes text, p_lines jsonb
) returns setof public.delivery_challans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allow_neg boolean;
  v_line      jsonb;
  v_idx       int := 0;
  v_mat_id    text;
  v_owner     text;
  v_scope     text;
  v_src       text;
  v_qty       numeric;
  v_unit      text;
  v_line_job  text;
  v_available numeric;
  v_mat_name  text;
  v_mat_unit  text;
begin
  if not exists (select 1 from companies where id = p_company_id) then
    raise exception 'Select a valid company';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from app_state where id = 'singleton';

  -- Pass 1: validate + lock + stock-check every line before touching anything.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_mat_id := v_line ->> 'materialId';
    v_owner  := coalesce(v_line ->> 'ownerType', 'Company');
    v_src    := nullif(v_line ->> 'sourceReceiptId', '');
    v_qty    := (v_line ->> 'quantity')::numeric;
    if v_mat_id is null or v_mat_id = '' then
      raise exception 'Every challan line must have a material';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Item quantity must be greater than zero';
    end if;
    select name, unit into v_mat_name, v_mat_unit from materials where id = v_mat_id;
    if not found then raise exception 'Select a valid material'; end if;
    v_scope := case when v_owner = 'Company' then p_company_id else null end;

    if v_src is not null then
      perform public.assert_source_dispatchable(v_src, v_mat_id, v_scope, v_qty, v_mat_unit, v_allow_neg);
    else
      perform pg_advisory_xact_lock(hashtext(v_mat_id || ':' || coalesce(v_scope, 'shop')));
      v_available := public.material_balance(v_mat_id, v_scope);
      if not v_allow_neg and v_qty > v_available then
        raise exception 'Insufficient stock for "%": available % %, requested %.',
          v_mat_name, v_available, v_mat_unit, v_qty;
      end if;
    end if;
  end loop;

  insert into delivery_challans (id, dc_no, date, company_id, job_id, reference, vehicle_no, lines, notes, status)
  values (p_id, p_dc_no, p_date, p_company_id, p_job_id, p_reference, p_vehicle_no, p_lines, p_notes, 'Open');

  -- Pass 2: post one stock-out issue per line, stamped with its source receipt.
  v_idx := 0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_mat_id   := v_line ->> 'materialId';
    v_owner    := coalesce(v_line ->> 'ownerType', 'Company');
    v_src      := nullif(v_line ->> 'sourceReceiptId', '');
    v_qty      := (v_line ->> 'quantity')::numeric;
    v_unit     := coalesce(v_line ->> 'unit', 'Nos');
    v_line_job := nullif(v_line ->> 'jobId', '');
    v_scope    := case when v_owner = 'Company' then p_company_id else null end;
    insert into material_issues (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note, reference_type, reference_id, source_receipt_id)
    values (p_id || '_iss_' || v_idx, p_dc_no || '/' || v_idx, p_date, v_mat_id,
            coalesce(v_line_job, p_job_id), v_scope, v_qty, v_unit,
            'Dispatched via challan ' || p_dc_no, 'DELIVERY_CHALLAN', p_id, v_src);
    v_idx := v_idx + 1;
  end loop;

  return query select * from delivery_challans where id = p_id;
end;
$$;

-- ---------- 6. Delivery challan: cancel (source-aware reversal) --------------
create or replace function public.cancel_challan(p_id text)
returns setof public.delivery_challans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_dc_no  text;
  r        record;
begin
  select status, dc_no into v_status, v_dc_no from delivery_challans where id = p_id;
  if not found then raise exception 'Delivery challan not found'; end if;

  if v_status <> 'Cancelled' then
    -- Reverse each dispatch with a compensating +qty adjustment attributed to the
    -- SAME source receipt, so that source's available is restored (originals kept
    -- for audit; net per-source balance returns to what it was).
    for r in select * from material_issues
             where reference_type = 'DELIVERY_CHALLAN' and reference_id = p_id loop
      insert into stock_adjustments (id, adj_no, date, material_id, company_id, quantity, unit, reason, source_receipt_id)
      values (p_id || '_rev_' || r.id, 'REV/' || r.issue_no, current_date, r.material_id,
              r.company_id, r.quantity, r.unit, 'Reversal: challan ' || v_dc_no || ' cancelled', r.source_receipt_id)
      on conflict (id) do nothing;
    end loop;
    update delivery_challans set status = 'Cancelled', updated_at = now() where id = p_id;
  end if;

  return query select * from delivery_challans where id = p_id;
end;
$$;

-- ---------- 7. Delivery challan: full edit (source-aware re-sync) ------------
create or replace function public.update_challan_full(
  p_id text, p_date date, p_company_id text, p_job_id text,
  p_reference text, p_vehicle_no text, p_notes text, p_lines jsonb
) returns setof public.delivery_challans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status    text;
  v_dc_no     text;
  v_allow_neg boolean;
  v_line      jsonb;
  v_idx       int := 0;
  v_mat_id    text;
  v_owner     text;
  v_scope     text;
  v_src       text;
  v_qty       numeric;
  v_unit      text;
  v_line_job  text;
  v_available numeric;
  v_mat_name  text;
  v_mat_unit  text;
begin
  select status, dc_no into v_status, v_dc_no from delivery_challans where id = p_id;
  if not found then raise exception 'Delivery challan not found'; end if;
  if v_status <> 'Open' then
    raise exception 'Only an open (un-invoiced) challan can be edited. Cancel an invoiced/cancelled challan to reverse its stock.';
  end if;
  if not exists (select 1 from companies where id = p_company_id) then
    raise exception 'Select a valid company';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from app_state where id = 'singleton';

  -- Permit rewriting this (dispatched) challan's lines within the transaction.
  perform set_config('app.allow_dc_line_edit', '1', true);

  -- Reverse the challan's current dispatch so the per-source check sees the
  -- restored availability (full re-sync = delete + re-post).
  delete from material_issues
    where reference_type = 'DELIVERY_CHALLAN' and reference_id = p_id;

  -- Pass 1: validate + lock + stock-check every new line before writing.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_mat_id := v_line ->> 'materialId';
    v_owner  := coalesce(v_line ->> 'ownerType', 'Company');
    v_src    := nullif(v_line ->> 'sourceReceiptId', '');
    v_qty    := (v_line ->> 'quantity')::numeric;
    if v_mat_id is null or v_mat_id = '' then
      raise exception 'Every challan line must have a material';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Item quantity must be greater than zero';
    end if;
    select name, unit into v_mat_name, v_mat_unit from materials where id = v_mat_id;
    if not found then raise exception 'Select a valid material'; end if;
    v_scope := case when v_owner = 'Company' then p_company_id else null end;

    if v_src is not null then
      perform public.assert_source_dispatchable(v_src, v_mat_id, v_scope, v_qty, v_mat_unit, v_allow_neg);
    else
      perform pg_advisory_xact_lock(hashtext(v_mat_id || ':' || coalesce(v_scope, 'shop')));
      v_available := public.material_balance(v_mat_id, v_scope);
      if not v_allow_neg and v_qty > v_available then
        raise exception 'Insufficient stock for "%": available % %, requested %.',
          v_mat_name, v_available, v_mat_unit, v_qty;
      end if;
    end if;
  end loop;

  update delivery_challans
    set date = p_date,
        company_id = p_company_id,
        job_id = nullif(p_job_id, ''),
        reference = p_reference,
        vehicle_no = p_vehicle_no,
        notes = p_notes,
        lines = p_lines,
        updated_at = now()
    where id = p_id;

  -- Pass 2: re-post one stock-out issue per line under its source + scope.
  v_idx := 0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_mat_id   := v_line ->> 'materialId';
    v_owner    := coalesce(v_line ->> 'ownerType', 'Company');
    v_src      := nullif(v_line ->> 'sourceReceiptId', '');
    v_qty      := (v_line ->> 'quantity')::numeric;
    v_unit     := coalesce(v_line ->> 'unit', 'Nos');
    v_line_job := nullif(v_line ->> 'jobId', '');
    v_scope    := case when v_owner = 'Company' then p_company_id else null end;
    insert into material_issues (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note, reference_type, reference_id, source_receipt_id)
    values (p_id || '_iss_' || v_idx, v_dc_no || '/' || v_idx, p_date, v_mat_id,
            coalesce(v_line_job, nullif(p_job_id, '')), v_scope, v_qty, v_unit,
            'Dispatched via challan ' || v_dc_no, 'DELIVERY_CHALLAN', p_id, v_src);
    v_idx := v_idx + 1;
  end loop;

  return query select * from delivery_challans where id = p_id;
end;
$$;

-- ---------- 8. Delivery challan: quantity-only edit (source-aware) -----------
-- Re-syncs the linked issue per (material, source). Match on source_receipt_id
-- too, since one material may now be dispatched from several sources on one DC.
create or replace function public.update_challan_quantities(
  p_id text, p_reference text, p_vehicle_no text, p_notes text, p_lines jsonb
) returns setof public.delivery_challans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status    text;
  v_dc_no     text;
  v_allow_neg boolean;
  v_line      jsonb;
  v_mat_id    text;
  v_owner     text;
  v_scope     text;
  v_src       text;
  v_new_qty   numeric;
  v_old_qty   numeric;
  v_issue_id  text;
  v_available numeric;
  v_mat_name  text;
  v_mat_unit  text;
begin
  select status, dc_no into v_status, v_dc_no from delivery_challans where id = p_id;
  if not found then raise exception 'Delivery challan not found'; end if;
  if v_status <> 'Open' then
    raise exception 'Only an open (un-invoiced) challan''s quantities can be edited.';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one item';
  end if;

  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from app_state where id = 'singleton';

  perform set_config('app.allow_dc_line_edit', '1', true);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_mat_id  := v_line ->> 'materialId';
    v_owner   := coalesce(v_line ->> 'ownerType', 'Company');
    v_src     := nullif(v_line ->> 'sourceReceiptId', '');
    v_new_qty := (v_line ->> 'quantity')::numeric;
    if v_mat_id is null or v_mat_id = '' then
      raise exception 'Every challan line must have a material';
    end if;
    if v_new_qty is null or v_new_qty <= 0 then
      raise exception 'Item quantity must be greater than zero';
    end if;
    v_scope := case when v_owner = 'Company' then (select company_id from delivery_challans where id = p_id) else null end;

    select id, quantity into v_issue_id, v_old_qty
      from material_issues
      where reference_type = 'DELIVERY_CHALLAN' and reference_id = p_id
        and material_id = v_mat_id and source_receipt_id is not distinct from v_src;
    if not found then
      raise exception 'Items can only have their quantity changed. To add or remove a material, cancel this challan and create a new one.';
    end if;

    if v_new_qty > v_old_qty then
      select name, unit into v_mat_name, v_mat_unit from materials where id = v_mat_id;
      if v_src is not null then
        -- receipt_available already nets the old issue, so the headroom check is
        -- against the extra amount only.
        perform pg_advisory_xact_lock(hashtext('rcp:' || v_src));
        v_available := public.receipt_available(v_src);
        if not coalesce(v_allow_neg, false) and (v_new_qty - v_old_qty) > v_available then
          raise exception 'Cannot dispatch % more %. Only % % are available for this material source.',
            (v_new_qty - v_old_qty), v_mat_unit, v_available, v_mat_unit;
        end if;
      else
        perform pg_advisory_xact_lock(hashtext(v_mat_id || ':' || coalesce(v_scope, 'shop')));
        v_available := public.material_balance(v_mat_id, v_scope);
        if not coalesce(v_allow_neg, false) and (v_new_qty - v_old_qty) > v_available then
          raise exception 'Insufficient stock for "%": only % % more available.',
            v_mat_name, v_available, v_mat_unit;
        end if;
      end if;
    end if;

    update material_issues set quantity = v_new_qty, updated_at = now() where id = v_issue_id;
  end loop;

  update delivery_challans
    set lines = p_lines,
        reference = p_reference,
        vehicle_no = p_vehicle_no,
        notes = p_notes,
        updated_at = now()
    where id = p_id;

  return query select * from delivery_challans where id = p_id;
end;
$$;

-- ---------- 9. Invoice: create (source-aware direct dispatch) ----------------
-- A material-linked invoice line may carry sourceReceiptId to consume a specific
-- received stock (per-source lock + check); lines without one keep the aggregate
-- behaviour. Deductions aggregate per (material, scope, source) so repeated
-- sources collapse to one issue each. Lines imported from a challan carry no
-- materialId (the challan already dispatched) — no double counting.
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
  v_scope     text;
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
      (id, invoice_id, job_id, description, quantity, rate, line_no, material_id, owner_type, source_receipt_id)
    values (v_line ->> 'id', p_id, nullif(v_line ->> 'jobId', ''), v_line ->> 'description',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'rate')::numeric, v_i,
      nullif(v_line ->> 'materialId', ''), nullif(v_line ->> 'ownerType', ''),
      nullif(v_line ->> 'sourceReceiptId', ''));
    v_i := v_i + 1;
  end loop;

  -- Stock-out for material-linked lines (a Cancelled invoice dispatches nothing).
  if p_status <> 'Cancelled' then
    select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
      into v_allow_neg from public.app_state where id = 'singleton';

    v_i := 0;
    -- Aggregate per (material, scope, source): repeated sources collapse to one
    -- issue. scope = null for 'Shop' (own stock), else the invoice's company.
    for rec in
      select
        nullif(l ->> 'materialId', '')                                                     as material_id,
        case when coalesce(l ->> 'ownerType', 'Company') = 'Shop' then null else p_company_id end as scope,
        nullif(l ->> 'sourceReceiptId', '')                                                as source_receipt_id,
        sum((l ->> 'quantity')::numeric)                                                    as qty,
        min(nullif(l ->> 'jobId', ''))                                                      as job_id
      from jsonb_array_elements(p_lines) as l
      where nullif(l ->> 'materialId', '') is not null
      group by 1, 2, 3
    loop
      select name, unit into v_mat_name, v_unit from public.materials where id = rec.material_id;
      if not found then raise exception 'Select a valid material'; end if;
      v_scope := rec.scope;

      if rec.source_receipt_id is not null then
        perform public.assert_source_dispatchable(rec.source_receipt_id, rec.material_id, v_scope,
                                                  rec.qty, coalesce(v_unit, 'Nos'), v_allow_neg);
      else
        perform pg_advisory_xact_lock(hashtext(rec.material_id || ':' || coalesce(v_scope, 'shop')));
        if not coalesce(v_allow_neg, false) and rec.qty > public.material_balance(rec.material_id, v_scope) then
          raise exception 'Insufficient stock for "%": available % %, requested %.',
            v_mat_name, public.material_balance(rec.material_id, v_scope), v_unit, rec.qty;
        end if;
      end if;

      insert into public.material_issues
        (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note, reference_type, reference_id, source_receipt_id)
      values (p_id || '_iss_' || v_i, p_invoice_no || '/' || v_i, p_date, rec.material_id,
              rec.job_id, v_scope, rec.qty, coalesce(v_unit, 'Nos'),
              'Billed via invoice ' || p_invoice_no, 'INVOICE', p_id, rec.source_receipt_id);
      v_i := v_i + 1;
    end loop;
  end if;

  return query select * from public.invoices where id = p_id;
end;
$$;

-- ---------- 10. Invoice: cancel (source-aware reversal) ---------------------
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
    select paid into v_paid from public.invoice_totals where invoice_id = p_id;
    if coalesce(v_paid, 0) > 0 then
      raise exception 'Invoice has payments recorded. Remove payments before cancelling.';
    end if;
    -- Reverse this invoice's own stock-outs with a compensating +qty adjustment
    -- attributed to the same source receipt (per-source availability restored).
    for r in select * from public.material_issues
             where reference_type = 'INVOICE' and reference_id = p_id loop
      insert into public.stock_adjustments (id, adj_no, date, material_id, company_id, quantity, unit, reason, source_receipt_id)
      values (p_id || '_rev_' || r.id, 'REV/' || r.issue_no, current_date, r.material_id,
              r.company_id, r.quantity, r.unit, 'Reversal: invoice ' || v_invoice_no || ' cancelled', r.source_receipt_id)
      on conflict (id) do nothing;
    end loop;
    update public.delivery_challans set status = 'Open', invoice_id = null, updated_at = now()
      where invoice_id = p_id;
  end if;

  update public.invoices set status = p_status, updated_at = now() where id = p_id;
  return query select * from public.invoices where id = p_id;
end;
$$;

grant execute on function public.create_challan_with_dispatch(text, text, date, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.cancel_challan(text) to authenticated;
grant execute on function public.update_challan_full(text, date, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.update_challan_quantities(text, text, text, text, jsonb) to authenticated;
grant execute on function public.create_invoice(text, text, date, text, text, text, text, text, numeric, numeric, numeric, numeric, invoice_status, text, jsonb) to authenticated;
grant execute on function public.set_invoice_status(text, invoice_status) to authenticated;
