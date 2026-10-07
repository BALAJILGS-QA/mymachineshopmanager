-- ============================================================================
-- Production Planning — Phase 3: Material Reservation & Availability
-- ============================================================================
-- Adds a SOFT reservation layer on top of the existing physical stock ledger
-- (materials / material_receipts / material_issues / stock_adjustments). It does
-- NOT duplicate the stock master or re-track physical quantities — a reservation
-- is a non-physical hold against a material's free stock so that one production
-- order cannot silently consume stock another order has already earmarked.
--
-- Model (mirrors the Tool Room ledger, 0028):
--   • material_reservations is a movement ledger. Each row records a positive
--     quantity + a kind: 'Reserve' (holds free stock), 'Release' (frees a hold),
--     'Consume' (converts a hold into a physical material_issue).
--   • Outstanding reservation for a material/scope = Σ Reserve − Σ Release − Σ Consume.
--   • Free (reservable) stock  = material_balance(material, scope) − outstanding.
--     Physical balance is unchanged by Reserve/Release; Consume issues physically
--     (so balance and the hold both drop together — Free is unaffected by consume).
--
-- Flow (reserve-then-consume): a production order carries a material requirement
-- (job_orders.material_required_qty). Material is RESERVED at planning and
-- CONSUMED (issued) on the shop floor. A Shortage is gated: reserving beyond free
-- stock requires PRODUCTION_RESERVE_OVERRIDE and is always audited.
--
-- SECURITY: the ledger is written ONLY through material_reserve_move()
-- (SECURITY DEFINER, permission-derived-from-kind, prod_can()-gated). End users
-- get read-only RLS on the table. Availability helpers are keyed by the globally
-- unique material_id (client-minted), so sums are per-tenant in practice (the
-- same property the existing material_balance relies on).
--
-- Additive + idempotent (create ... if not exists / or replace, on conflict do
-- nothing). Touches no existing row. Next free migration number after 0073.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-order material requirement + chosen stock pool (additive, nullable).
--    material_owner_scope: NULL = own/shop stock; a company_id = that customer's
--    supplied stock. The SAME material can hold stock in more than one pool, so
--    the pool is a per-order choice (made at planning), not a property of the
--    material master — reserve / consume / status all read it from the order.
-- ---------------------------------------------------------------------------
alter table public.job_orders
  add column if not exists material_required_qty numeric;
alter table public.job_orders
  add column if not exists material_owner_scope text;

-- ---------------------------------------------------------------------------
-- 2. Reservation ledger
-- ---------------------------------------------------------------------------
create table if not exists public.material_reservations (
  id          text primary key,
  job_id      text not null references public.job_orders(id) on delete cascade,
  material_id text not null references public.materials(id),
  owner_scope text,                         -- null = own/shop stock; company_id = that customer's stock
  kind        text not null check (kind in ('Reserve', 'Release', 'Consume')),
  quantity    numeric not null check (quantity > 0),
  unit        text,
  issue_id    text references public.material_issues(id),  -- set when kind = 'Consume'
  note        text,
  actor_email text,
  created_at  timestamptz not null default now(),
  tenant_id   text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_matres_tenant   on public.material_reservations (tenant_id);
create index if not exists idx_matres_job       on public.material_reservations (job_id);
create index if not exists idx_matres_material   on public.material_reservations (material_id, owner_scope);

-- RLS: tenant-scoped reads; no write policy — writes go through the SECURITY
-- DEFINER RPC only (mirrors tool_transactions in 0028).
alter table public.material_reservations enable row level security;
drop policy if exists matres_tenant_read on public.material_reservations;
create policy matres_tenant_read on public.material_reservations for select to authenticated
  using (public.has_tenant_access(tenant_id));

-- Cross-tenant reference guard (0046 pattern): a reservation must not point at a
-- job / material / issue in a different tenant.
create or replace function public.guard_xt_material_reservations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_orders',      new.job_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.materials',        new.material_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.material_issues',  new.issue_id);
  return new;
end $$;
drop trigger if exists trg_xt_material_reservations on public.material_reservations;
create trigger trg_xt_material_reservations before insert or update on public.material_reservations
  for each row execute function public.guard_xt_material_reservations();

-- ---------------------------------------------------------------------------
-- 3. Availability helpers (read-only; keyed by unique material_id)
-- ---------------------------------------------------------------------------
-- Outstanding reservation for a material within an owner scope. p_job_id null =
-- across every order; else just that order. "is not distinct from" matches NULL
-- (shop) scope. SECURITY INVOKER: RLS applies, and the unique material_id keeps
-- the sum within one tenant regardless.
create or replace function public.material_reserved(
  p_material_id text, p_scope text, p_job_id text default null)
returns numeric language sql stable security invoker set search_path = public as $$
  select coalesce(sum(case when kind = 'Reserve' then quantity else -quantity end), 0)
  from public.material_reservations
  where material_id = p_material_id
    and owner_scope is not distinct from p_scope
    and (p_job_id is null or job_id = p_job_id);
$$;

-- Free (reservable) stock = physical balance − outstanding reservations.
create or replace function public.material_free(p_material_id text, p_scope text)
returns numeric language sql stable security invoker set search_path = public as $$
  select public.material_balance(p_material_id, p_scope)
       - public.material_reserved(p_material_id, p_scope, null);
$$;

-- One-shot material status for a production order (feeds the Materials tab).
-- Scope = the order's chosen stock pool (j.material_owner_scope).
create or replace function public.job_material_status(p_job_id text)
returns table (
  material_id text, owner_scope text, unit text,
  required numeric, reserved numeric, consumed numeric, free numeric, balance numeric
) language sql stable security invoker set search_path = public as $$
  select
    m.id, j.material_owner_scope, m.unit,
    coalesce(j.material_required_qty, 0)                                  as required,
    public.material_reserved(m.id, j.material_owner_scope, j.id)          as reserved,
    coalesce((select sum(i.quantity) from public.material_issues i
              where i.job_id = j.id and i.material_id = m.id), 0)         as consumed,
    public.material_free(m.id, j.material_owner_scope)                    as free,
    public.material_balance(m.id, j.material_owner_scope)                 as balance
  from public.job_orders j
  join public.materials  m on m.id = j.material_id
  where j.id = p_job_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. set_material_requirement() — set the per-order requirement (planning)
-- ---------------------------------------------------------------------------
create or replace function public.set_material_requirement(
  p_job_id text, p_required_qty numeric, p_owner_scope text default null)
returns setof public.job_orders
language plpgsql security definer set search_path = public as $$
declare j public.job_orders;
begin
  if not public.prod_can('PRODUCTION_RESERVE') then
    raise exception 'Not authorized: PRODUCTION_RESERVE';
  end if;
  if coalesce(p_required_qty, 0) < 0 then
    raise exception 'Required quantity cannot be negative';
  end if;
  select * into j from public.job_orders where id = p_job_id;
  if not found then raise exception 'Production order not found'; end if;
  if j.material_id is null then
    raise exception 'Link a raw material to this production order before setting a requirement';
  end if;

  update public.job_orders
     set material_required_qty = p_required_qty,
         material_owner_scope  = p_owner_scope,   -- null = shop pool
         updated_at = now()
   where id = p_job_id;

  perform public.hr_log(
    'set_requirement', 'job', p_job_id,
    concat('Material requirement set to ', p_required_qty::text),
    jsonb_build_object('required', j.material_required_qty, 'scope', j.material_owner_scope),
    jsonb_build_object('required', p_required_qty, 'scope', p_owner_scope),
    j.company_id, null);

  return query select * from public.job_orders where id = p_job_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. material_reserve_move() — the single atomic, permission-checked ledger writer
-- ---------------------------------------------------------------------------
-- The required permission and the stock effect are DERIVED from p_kind, so a
-- client cannot post a Consume while claiming only Reserve rights, nor forge an
-- invalid movement. Owner scope is taken from the material master (company_id),
-- never trusted from the client.
create or replace function public.material_reserve_move(
  p_id       text,
  p_job_id   text,
  p_kind     text,                 -- 'Reserve' | 'Release' | 'Consume'
  p_qty      numeric,
  p_override boolean default false,
  p_issue_id text    default null, -- required for Consume (the physical issue id)
  p_issue_no text    default null,
  p_note     text    default null
) returns setof public.material_reservations
language plpgsql security definer set search_path = public as $$
declare
  j          public.job_orders;
  v_material text;
  v_scope    text;        -- null = shop
  v_unit     text;
  v_name     text;
  v_balance  numeric;
  v_res_mat  numeric;     -- outstanding reservation for material/scope (all orders)
  v_res_job  numeric;     -- outstanding reservation for THIS order
  v_free     numeric;
  v_allow_neg boolean;
  v_issue_id text := null;
begin
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into j from public.job_orders where id = p_job_id;
  if not found then raise exception 'Production order not found'; end if;

  v_material := j.material_id;
  if v_material is null then
    raise exception 'This production order has no raw material linked';
  end if;

  -- Scope is the order's chosen stock pool (null = shop), NOT the material master.
  v_scope := j.material_owner_scope;
  select unit, name into v_unit, v_name from public.materials where id = v_material;

  v_res_mat := public.material_reserved(v_material, v_scope, null);
  v_res_job := public.material_reserved(v_material, v_scope, p_job_id);
  v_balance := public.material_balance(v_material, v_scope);
  v_free    := v_balance - v_res_mat;

  if p_kind = 'Reserve' then
    if not public.prod_can('PRODUCTION_RESERVE') then
      raise exception 'Not authorized: PRODUCTION_RESERVE';
    end if;
    if p_qty > v_free then
      if not coalesce(p_override, false) then
        raise exception
          'Only % % of "%" free to reserve (requested %). Enable override to reserve beyond availability.',
          v_free, coalesce(v_unit, ''), v_name, p_qty;
      end if;
      if not public.prod_can('PRODUCTION_RESERVE_OVERRIDE') then
        raise exception 'Not authorized to reserve beyond available stock (PRODUCTION_RESERVE_OVERRIDE)';
      end if;
    end if;

  elsif p_kind = 'Release' then
    if not public.prod_can('PRODUCTION_RESERVE') then
      raise exception 'Not authorized: PRODUCTION_RESERVE';
    end if;
    if p_qty > v_res_job then
      raise exception 'Cannot release % — only % reserved for this order.', p_qty, v_res_job;
    end if;

  elsif p_kind = 'Consume' then
    if not public.prod_can('PRODUCTION_CONSUME') then
      raise exception 'Not authorized: PRODUCTION_CONSUME';
    end if;
    if p_qty > v_res_job then
      raise exception 'Cannot consume % — only % reserved for this order. Reserve first.', p_qty, v_res_job;
    end if;
    if p_issue_id is null then
      raise exception 'An issue id is required to consume material';
    end if;
    -- Honour the non-negative-stock rule (same gate as create_material_issue).
    select coalesce((data -> 'settings' ->> 'allowNegativeStock')::boolean, false)
      into v_allow_neg from public.app_state where id = 'singleton';
    if not coalesce(v_allow_neg, false) and p_qty > v_balance then
      raise exception 'Only % % of "%" physically in stock — cannot consume %.',
        v_balance, coalesce(v_unit, ''), v_name, p_qty;
    end if;
    -- Physically issue the material (reuses the existing stock ledger).
    insert into public.material_issues
      (id, issue_no, date, material_id, job_id, company_id, quantity, unit, note, reference_type, reference_id)
    values
      (p_issue_id, coalesce(p_issue_no, p_issue_id), current_date, v_material, p_job_id, v_scope,
       p_qty, v_unit, coalesce(p_note, 'Consumed against reservation for ' || j.job_no),
       'reservation', p_id);
    v_issue_id := p_issue_id;

  else
    raise exception 'Unknown reservation kind: %', p_kind;
  end if;

  return query
  insert into public.material_reservations
    (id, job_id, material_id, owner_scope, kind, quantity, unit, issue_id, note, actor_email)
  values
    (p_id, p_job_id, v_material, v_scope, p_kind, p_qty, v_unit, v_issue_id, p_note,
     public.hr_current_email())
  returning *;

  perform public.hr_log(
    lower(p_kind), 'material_reservation', p_id,
    concat_ws(' ', p_kind, p_qty::text, coalesce(v_unit, ''), 'for', j.job_no),
    null,
    jsonb_build_object('job_id', p_job_id, 'job_no', j.job_no, 'material_id', v_material,
                       'kind', p_kind, 'qty', p_qty, 'scope', v_scope,
                       'free_before', v_free, 'override', coalesce(p_override, false)),
    j.company_id,
    jsonb_build_object('issue_id', v_issue_id));
end $$;

-- ---------------------------------------------------------------------------
-- 6. RBAC — extend the shared Production permission catalog + grant to roles
-- ---------------------------------------------------------------------------
insert into public.hr_permissions (key, module, label, description, sort) values
  ('PRODUCTION_RESERVE',          'Production', 'Reserve material',  'Reserve / release raw material for a production order', 317),
  ('PRODUCTION_CONSUME',          'Production', 'Consume material',  'Issue reserved material to production (consume)',       318),
  ('PRODUCTION_RESERVE_OVERRIDE', 'Production', 'Override shortage', 'Reserve beyond available free stock (shortage override)', 319)
on conflict (key) do nothing;

-- hr_admin → all; hr_manager + prod_manager + store → plan/reserve + consume
-- (separation of duties: the shortage OVERRIDE is manager-level only, and the
-- shop-floor operator may consume reserved stock but not reserve/override).
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_admin', key, 'all' from public.hr_permissions
  where key in ('PRODUCTION_RESERVE', 'PRODUCTION_CONSUME', 'PRODUCTION_RESERVE_OVERRIDE')
on conflict do nothing;

insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_manager', key, 'company' from public.hr_permissions
  where key in ('PRODUCTION_RESERVE', 'PRODUCTION_CONSUME', 'PRODUCTION_RESERVE_OVERRIDE')
on conflict do nothing;

insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_prod_manager', key, 'company' from public.hr_permissions
  where key in ('PRODUCTION_RESERVE', 'PRODUCTION_CONSUME', 'PRODUCTION_RESERVE_OVERRIDE')
on conflict do nothing;

insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_store', key, 'company' from public.hr_permissions
  where key in ('PRODUCTION_RESERVE', 'PRODUCTION_CONSUME')
on conflict do nothing;

insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_prod_operator', 'PRODUCTION_CONSUME', 'team'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.material_reserved(text, text, text)       to authenticated;
grant execute on function public.material_free(text, text)                 to authenticated;
grant execute on function public.job_material_status(text)                 to authenticated;
grant execute on function public.set_material_requirement(text, numeric, text) to authenticated;
grant execute on function public.material_reserve_move(text, text, text, numeric, boolean, text, text, text) to authenticated;
