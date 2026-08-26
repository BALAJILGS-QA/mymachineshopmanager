-- ============================================================================
-- Phase 6 - Stock rule RPCs (material issue + stock adjustment)
-- ============================================================================
-- Ports the non-negative-stock rules from src/data/repo.ts into Postgres so they
-- hold no matter which client writes. SECURITY INVOKER: the function runs as the
-- caller, so RLS (approved_all) still gates access - an unapproved user cannot
-- insert. The document number is formatted client-side (formatDocNo over next_seq)
-- and passed in; these functions own the CHECK + INSERT atomically.
--
-- Stock scope: company_id NULL = own/shop stock; a company_id = that customer's
-- stock. "is not distinct from" makes the NULL match work.
--
-- Idempotent (create or replace). Additive. No DROP/TRUNCATE.
-- ============================================================================

-- Balance of a material within an owner scope (shop when p_company_id is null).
create or replace function public.material_balance(p_material_id text, p_company_id text)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select
      coalesce((select sum(quantity) from material_receipts  r where r.material_id = p_material_id and r.company_id is not distinct from p_company_id), 0)
    - coalesce((select sum(quantity) from material_issues    i where i.material_id = p_material_id and i.company_id is not distinct from p_company_id), 0)
    + coalesce((select sum(quantity) from stock_adjustments  a where a.material_id = p_material_id and a.company_id is not distinct from p_company_id), 0);
$$;

create or replace function public.create_material_issue(
  p_id text, p_issue_no text, p_date date, p_material_id text, p_job_id text,
  p_company_id text, p_quantity numeric, p_unit text, p_note text,
  p_override boolean default false
) returns setof public.material_issues
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_available numeric;
  v_allow_neg boolean;
begin
  if p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  v_available := public.material_balance(p_material_id, p_company_id);
  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from public.app_state where id = 'singleton';

  if not coalesce(v_allow_neg, false) and not coalesce(p_override, false)
     and p_quantity > v_available then
    raise exception 'Only % in stock for this material. Enable override to issue anyway.', v_available;
  end if;

  return query
  insert into public.material_issues (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note)
  values (p_id, p_issue_no, p_date, p_material_id, p_job_id, p_company_id, p_quantity, p_unit, p_note)
  returning *;
end;
$$;

create or replace function public.create_stock_adjustment(
  p_id text, p_adj_no text, p_date date, p_material_id text, p_company_id text,
  p_quantity numeric, p_unit text, p_reason text
) returns setof public.stock_adjustments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bal numeric;
  v_allow_neg boolean;
begin
  if p_quantity = 0 then
    raise exception 'Adjustment quantity cannot be zero';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required for adjustments';
  end if;

  v_bal := public.material_balance(p_material_id, p_company_id);
  select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
    into v_allow_neg from public.app_state where id = 'singleton';

  if not coalesce(v_allow_neg, false) and (v_bal + p_quantity) < 0 then
    raise exception 'Adjustment would make stock negative';
  end if;

  return query
  insert into public.stock_adjustments (id, adj_no, date, material_id, company_id, quantity, unit, reason)
  values (p_id, p_adj_no, p_date, p_material_id, p_company_id, p_quantity, p_unit, btrim(p_reason))
  returning *;
end;
$$;

grant execute on function public.material_balance(text, text) to authenticated;
grant execute on function public.create_material_issue(text, text, date, text, text, text, numeric, text, text, boolean) to authenticated;
grant execute on function public.create_stock_adjustment(text, text, date, text, text, numeric, text, text) to authenticated;
