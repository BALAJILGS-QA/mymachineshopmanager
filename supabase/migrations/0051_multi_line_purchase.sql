-- ============================================================================
-- Multi-line purchases: buy several materials (or several tools) as ONE purchase
-- record — a single combined Expense plus one stock/tool receipt per line.
-- ============================================================================
-- Own material purchase and tool purchase are deliberately SEPARATE flows:
--   • create_own_purchase_multi  — 1 expense + N Shop stock receipts (+qty each)
--                                  + N own_material_purchases, all sharing the
--                                  one expense_id. Mirrors 0009's single-line RPC.
--   • create_tool_purchase_multi — 1 expense + M tool_move('receipt') movements
--                                  (adds each tool to the 'available' bucket),
--                                  each tagged ref_type='expense' → the expense.
-- Both are atomic (one transaction): a failure on any line rolls back the whole
-- purchase, so there are never orphan receipts or a half-recorded expense.
-- Client supplies all ids / numbers (idempotent). Additive; no schema changes.
-- ============================================================================

-- 1. Materials ----------------------------------------------------------------
create or replace function public.create_own_purchase_multi(
  p_expense_id text,
  p_expense_no text,
  p_date       date,
  p_supplier   text,
  p_method     payment_method,
  p_notes      text,
  p_category   text,
  p_lines      jsonb   -- [{material_id, quantity, unit, total_cost, total_gst, receipt_id, receipt_no, opur_id}]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line  jsonb;
  v_total numeric := 0;
  v_qty   numeric;
  v_cost  numeric;
  v_gst   numeric;
  v_rate  numeric;
  v_n     int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) < 1 then
    raise exception 'Add at least one material line';
  end if;

  -- Validate every line first + accumulate the combined total.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from materials where id = v_line->>'material_id') then
      raise exception 'Select a valid material';
    end if;
    v_qty  := coalesce((v_line->>'quantity')::numeric, 0);
    v_cost := coalesce((v_line->>'total_cost')::numeric, 0);
    v_gst  := coalesce((v_line->>'total_gst')::numeric, 0);
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    if v_cost < 0 or v_gst < 0 then raise exception 'Cost and GST cannot be negative'; end if;
    v_total := v_total + v_cost + v_gst;
  end loop;

  -- One combined expense for the whole purchase (breakdown lives on the rows).
  insert into expenses (id, expense_no, date, category, amount, method, vendor, reference, notes)
  values (p_expense_id, p_expense_no, p_date,
          coalesce(nullif(p_category, ''), 'Material Purchase'),
          v_total, p_method, p_supplier, 'OWN_PURCHASE', p_notes);

  -- One Shop stock receipt + one purchase row per line, all linked to the expense.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty  := (v_line->>'quantity')::numeric;
    v_cost := coalesce((v_line->>'total_cost')::numeric, 0);
    v_gst  := coalesce((v_line->>'total_gst')::numeric, 0);
    v_rate := round(v_cost / v_qty, 2);

    insert into material_receipts (id, receipt_no, date, material_id, owner_type, company_id,
      supplier, quantity, unit, rate, reference, notes)
    values (v_line->>'receipt_id', v_line->>'receipt_no', p_date, v_line->>'material_id', 'Shop', null,
      p_supplier, v_qty, coalesce(v_line->>'unit', 'Nos'), v_rate, 'OWN_PURCHASE', p_notes);

    insert into own_material_purchases (id, supplier, material_id, purchase_date, quantity, unit,
      total_cost, total_gst, total_amount, notes, receipt_id, expense_id)
    values (v_line->>'opur_id', p_supplier, v_line->>'material_id', p_date, v_qty,
      coalesce(v_line->>'unit', 'Nos'), v_cost, v_gst, v_cost + v_gst, p_notes,
      v_line->>'receipt_id', p_expense_id);

    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('expense_id', p_expense_id, 'expense_no', p_expense_no,
                            'lines', v_n, 'total', v_total);
end $$;

grant execute on function public.create_own_purchase_multi(
  text, text, date, text, payment_method, text, text, jsonb) to authenticated;

-- 2. Tools --------------------------------------------------------------------
create or replace function public.create_tool_purchase_multi(
  p_expense_id text,
  p_expense_no text,
  p_date       date,
  p_supplier   text,
  p_method     payment_method,
  p_notes      text,
  p_category   text,
  p_lines      jsonb   -- [{tool_id, qty, unit, unit_cost, txn_id, txn_no}]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line  jsonb;
  v_total numeric := 0;
  v_qty   numeric;
  v_uc    numeric;
  v_n     int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) < 1 then
    raise exception 'Add at least one tool line';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from tools where id = v_line->>'tool_id') then
      raise exception 'Select a valid tool';
    end if;
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    v_uc  := coalesce((v_line->>'unit_cost')::numeric, 0);
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    if v_uc < 0 then raise exception 'Unit cost cannot be negative'; end if;
    v_total := v_total + v_qty * v_uc;
  end loop;

  insert into expenses (id, expense_no, date, category, amount, method, vendor, reference, notes)
  values (p_expense_id, p_expense_no, p_date,
          coalesce(nullif(p_category, ''), 'Tool Purchase'),
          v_total, p_method, p_supplier, 'TOOL_PURCHASE', p_notes);

  -- Each line is an atomic tool 'receipt' (into 'available'), tagged to the expense.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    perform public.tool_move(
      p_id        => v_line->>'txn_id',
      p_txn_no    => v_line->>'txn_no',
      p_tool_id   => v_line->>'tool_id',
      p_txn_type  => 'receipt',
      p_qty       => (v_line->>'qty')::numeric,
      p_unit      => coalesce(v_line->>'unit', 'nos'),
      p_unit_cost => coalesce((v_line->>'unit_cost')::numeric, 0),
      p_ref_type  => 'expense',
      p_ref_id    => p_expense_id,
      p_ref_no    => p_expense_no,
      p_note      => p_notes
    );
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('expense_id', p_expense_id, 'expense_no', p_expense_no,
                            'lines', v_n, 'total', v_total);
end $$;

grant execute on function public.create_tool_purchase_multi(
  text, text, date, text, payment_method, text, text, jsonb) to authenticated;
