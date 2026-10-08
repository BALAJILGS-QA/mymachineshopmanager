-- ============================================================================
-- Production Planning — Estimation & Quotation (schema + RLS + RBAC)
-- ============================================================================
-- Adds a costing/estimation layer and a customer-quotation layer to Production
-- Planning. An estimation captures the manufacturing cost of ONE part (raw
-- material + machining operations + other costs) and a target price; once
-- approved it is converted into a customer quotation (GST, terms, lifecycle),
-- which — when accepted — converts into a Production Order (job_orders) exactly
-- once.
--
-- Design notes:
--   * All tables are tenant-owned (tenant_id DEFAULT current_tenant_id() + RLS
--     has_tenant_access + cross-tenant FK guards), matching 0042-0048/0074/0075.
--   * Business numbers (estimation_no / quotation_no) are allocated server-side
--     via next_seq (tenant-scoped, race-safe) — see the app's numbering.ts.
--   * Monetary/derived figures are SNAPSHOT onto the header rows on save: an
--     estimate and a quotation are point-in-time DOCUMENTS whose values must be
--     preserved even when masters change (spec §5/§8). The pure calculation
--     source of truth lives in src/data/computations.ts; the RPCs persist what
--     the validated form computed.
--   * Statuses are text + CHECK (no enum churn), mirroring the app's convention
--     for document lifecycles.
--
-- Additive + idempotent. Reversible (drop tables + perms). This migration does
-- the DDL + RLS + RBAC; the rule-bearing RPCs live in 0088. Next free after 0086.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. estimations (header) — one costed part
-- ---------------------------------------------------------------------------
create table if not exists public.estimations (
  id                    text primary key,
  estimation_no         text not null,
  estimation_date       date not null default current_date,
  company_id            text not null references public.companies(id),
  customer_part_number  text,
  part_name             text not null,
  part_description      text,
  drawing_number        text,
  drawing_revision      text,
  product_id            text references public.products(id),
  material_id           text references public.materials(id),
  material_grade        text,
  raw_material_form     text,            -- Round Bar / Square Bar / Flat Bar / Plate / Casting / Custom
  material_shape_dims   jsonb,           -- shape-specific mm: {diameter,length,width,thickness}
  finished_dims         text,
  material_density      numeric,         -- g/cc (configurable; pre-filled per grade, user-overridable)
  material_rate         numeric,         -- per kg (or applicable unit)
  cutting_allowance     numeric not null default 0,  -- mm added to length
  machining_allowance   numeric not null default 0,  -- mm added to section/diameter
  wastage_percent       numeric not null default 0,
  scrap_recovery_pc     numeric not null default 0,  -- recovery value per piece (subtracted)
  quantity              numeric not null default 1,
  expected_delivery_date date,
  manufacturing_notes   text,
  drawing_path          text,
  -- other manufacturing costs (per piece unless noted)
  fixtures_tooling_cost numeric not null default 0,  -- total for the batch (amortized / qty)
  inspection_cost_pc    numeric not null default 0,
  overhead_cost_pc      numeric not null default 0,
  labour_cost_pc        numeric not null default 0,
  packing_cost_pc       numeric not null default 0,
  transport_cost_pc     numeric not null default 0,
  outsource_cost_pc     numeric not null default 0,
  rejection_percent     numeric not null default 0,
  other_cost_pc         numeric not null default 0,
  -- pricing
  pricing_method        text not null default 'margin',  -- 'markup' | 'margin'
  markup_percent        numeric not null default 0,
  margin_percent        numeric not null default 0,
  -- snapshot summary (computed in computations.ts, written on save; for list/reporting)
  material_cost_pc      numeric not null default 0,
  machining_cost_pc     numeric not null default 0,
  total_cost_pc         numeric not null default 0,
  selling_price_pc      numeric not null default 0,
  total_cost            numeric not null default 0,
  total_selling         numeric not null default 0,
  margin_pct_effective  numeric not null default 0,
  -- lifecycle + audit
  status                text not null default 'Draft'
                          check (status in ('Draft','Under Review','Approved','Rejected','Converted to Quotation')),
  approved_by           text,
  approved_at           timestamptz,
  created_by            text,
  updated_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  tenant_id             text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_estimations_tenant   on public.estimations (tenant_id);
create index if not exists idx_estimations_company  on public.estimations (company_id);
create index if not exists idx_estimations_status    on public.estimations (status);
create unique index if not exists uq_estimations_no_tenant on public.estimations (tenant_id, estimation_no);

-- ---------------------------------------------------------------------------
-- 2. estimation_operations (child) — machining operation sequence
-- ---------------------------------------------------------------------------
create table if not exists public.estimation_operations (
  id                    text primary key,
  estimation_id         text not null references public.estimations(id) on delete cascade,
  seq                   int not null default 1,
  operation_name        text not null,
  machine_type          text,
  setup_time_min        numeric not null default 0,   -- total setup for the batch
  cycle_time_min        numeric not null default 0,   -- per piece
  batch_qty             numeric not null default 1,
  machine_hour_rate     numeric not null default 0,
  operator_cost_hour    numeric not null default 0,
  tooling_cost          numeric not null default 0,   -- per batch (consumables/tooling)
  subcontract_cost_pc   numeric not null default 0,   -- per piece
  notes                 text,
  tenant_id             text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_est_ops_estimation on public.estimation_operations (estimation_id);
create index if not exists idx_est_ops_tenant     on public.estimation_operations (tenant_id);

-- ---------------------------------------------------------------------------
-- 3. quotations (header)
-- ---------------------------------------------------------------------------
create table if not exists public.quotations (
  id                    text primary key,
  quotation_no          text not null,
  quotation_date        date not null default current_date,
  expiry_date           date,
  company_id            text not null references public.companies(id),
  estimation_id         text references public.estimations(id),
  billing_address       text,
  shipping_address      text,
  customer_gstin        text,
  contact_person        text,
  contact_phone         text,
  contact_email         text,
  place_of_supply_state_code text,
  advance_percent       numeric not null default 0,
  payment_terms         text,
  delivery_lead_time    text,
  packing_charge        numeric not null default 0,
  freight_charge        numeric not null default 0,
  cgst_percent          numeric not null default 0,
  sgst_percent          numeric not null default 0,
  igst_percent          numeric not null default 0,
  -- snapshot totals (computed in computations.ts; preserved historically)
  subtotal              numeric not null default 0,
  discount_total        numeric not null default 0,
  taxable_value         numeric not null default 0,
  cgst_amount           numeric not null default 0,
  sgst_amount           numeric not null default 0,
  igst_amount           numeric not null default 0,
  grand_total           numeric not null default 0,
  notes                 text,
  terms_conditions      text,
  status                text not null default 'Draft'
                          check (status in ('Draft','Pending Approval','Approved','Sent','Accepted','Rejected','Expired','Cancelled')),
  sent_at               timestamptz,
  accepted_at           timestamptz,
  rejected_at           timestamptz,
  approved_by           text,
  approved_at           timestamptz,
  job_order_id          text references public.job_orders(id),
  revision_no           int not null default 1,
  revises_quotation_id  text references public.quotations(id),
  created_by            text,
  updated_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  tenant_id             text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_quotations_tenant  on public.quotations (tenant_id);
create index if not exists idx_quotations_company  on public.quotations (company_id);
create index if not exists idx_quotations_status   on public.quotations (status);
create index if not exists idx_quotations_est      on public.quotations (estimation_id);
create unique index if not exists uq_quotations_no_tenant on public.quotations (tenant_id, quotation_no);

-- ---------------------------------------------------------------------------
-- 4. quotation_lines (child)
-- ---------------------------------------------------------------------------
create table if not exists public.quotation_lines (
  id                text primary key,
  quotation_id      text not null references public.quotations(id) on delete cascade,
  line_no           int not null default 1,
  part_number       text,
  description       text not null,
  hsn               text,
  quantity          numeric not null default 1,
  unit              text,
  unit_price        numeric not null default 0,
  discount_percent  numeric not null default 0,
  gst_percent       numeric not null default 0,
  line_total        numeric not null default 0,  -- snapshot: qty*price*(1-disc%)
  tenant_id         text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_quotation_lines_q on public.quotation_lines (quotation_id);
create index if not exists idx_quotation_lines_tenant on public.quotation_lines (tenant_id);

-- ---------------------------------------------------------------------------
-- 5. quotation_status_history (audit trail of lifecycle transitions)
-- ---------------------------------------------------------------------------
create table if not exists public.quotation_status_history (
  id            text primary key,
  quotation_id  text not null references public.quotations(id) on delete cascade,
  from_status   text,
  to_status     text not null,
  note          text,
  actor         text,
  at            timestamptz not null default now(),
  tenant_id     text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_quotation_hist_q on public.quotation_status_history (quotation_id);
create index if not exists idx_quotation_hist_tenant on public.quotation_status_history (tenant_id);

-- ---------------------------------------------------------------------------
-- 6. RLS — tenant isolation (same pattern as every tenant-owned table)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['estimations','estimation_operations','quotations','quotation_lines','quotation_status_history']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_tenant_isolation on public.%I', t, t);
    execute format(
      'create policy %I_tenant_isolation on public.%I for all to authenticated '
      || 'using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))',
      t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Cross-tenant FK guards (block referencing another tenant's rows)
-- ---------------------------------------------------------------------------
create or replace function public.guard_xt_estimations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.companies', new.company_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.products',  new.product_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.materials', new.material_id);
  return new;
end $$;
drop trigger if exists trg_xt_estimations on public.estimations;
create trigger trg_xt_estimations before insert or update on public.estimations
  for each row execute function public.guard_xt_estimations();

create or replace function public.guard_xt_estimation_operations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.estimations', new.estimation_id);
  return new;
end $$;
drop trigger if exists trg_xt_estimation_operations on public.estimation_operations;
create trigger trg_xt_estimation_operations before insert or update on public.estimation_operations
  for each row execute function public.guard_xt_estimation_operations();

create or replace function public.guard_xt_quotations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.companies',   new.company_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.estimations', new.estimation_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_orders',  new.job_order_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.quotations',  new.revises_quotation_id);
  return new;
end $$;
drop trigger if exists trg_xt_quotations on public.quotations;
create trigger trg_xt_quotations before insert or update on public.quotations
  for each row execute function public.guard_xt_quotations();

create or replace function public.guard_xt_quotation_lines()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.quotations', new.quotation_id);
  return new;
end $$;
drop trigger if exists trg_xt_quotation_lines on public.quotation_lines;
create trigger trg_xt_quotation_lines before insert or update on public.quotation_lines
  for each row execute function public.guard_xt_quotation_lines();

create or replace function public.guard_xt_quotation_status_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.quotations', new.quotation_id);
  return new;
end $$;
drop trigger if exists trg_xt_quotation_status_history on public.quotation_status_history;
create trigger trg_xt_quotation_status_history before insert or update on public.quotation_status_history
  for each row execute function public.guard_xt_quotation_status_history();

-- ---------------------------------------------------------------------------
-- 8. RBAC — permissions (module 'Production', sort 330+) + role grants
-- ---------------------------------------------------------------------------
insert into public.hr_permissions (key, module, label, description, sort) values
  ('ESTIMATION_VIEW',    'Production', 'View estimations',    'Access and view cost estimations',        330),
  ('ESTIMATION_CREATE',  'Production', 'Create estimations',  'Create, edit and duplicate estimations',  331),
  ('ESTIMATION_APPROVE', 'Production', 'Approve estimations', 'Review, approve or reject estimations',   332),
  ('QUOTATION_VIEW',     'Production', 'View quotations',     'Access and view customer quotations',     340),
  ('QUOTATION_CREATE',   'Production', 'Create quotations',   'Create, edit, revise and send quotations', 341),
  ('QUOTATION_APPROVE',  'Production', 'Approve quotations',  'Approve, cancel or reject quotations',     342),
  ('QUOTATION_CONVERT',  'Production', 'Convert quotations',  'Convert an accepted quotation to a job',   343)
on conflict (key) do update
  set module = excluded.module, label = excluded.label,
      description = excluded.description, sort = excluded.sort;

-- HR Admin: everything at 'all'
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_admin', key, 'all' from public.hr_permissions
  where key in ('ESTIMATION_VIEW','ESTIMATION_CREATE','ESTIMATION_APPROVE',
                'QUOTATION_VIEW','QUOTATION_CREATE','QUOTATION_APPROVE','QUOTATION_CONVERT')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- HR Manager + Production Manager: full estimation/quotation at 'company'
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select r.role_id, p.key, 'company'
  from (values ('role_hr_manager'), ('role_prod_manager')) as r(role_id)
  cross join (select key from public.hr_permissions
              where key in ('ESTIMATION_VIEW','ESTIMATION_CREATE','ESTIMATION_APPROVE',
                            'QUOTATION_VIEW','QUOTATION_CREATE','QUOTATION_APPROVE','QUOTATION_CONVERT')) p
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- Operator / Store: view-only
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select r.role_id, p.key, 'team'
  from (values ('role_prod_operator'), ('role_store')) as r(role_id)
  cross join (select key from public.hr_permissions
              where key in ('ESTIMATION_VIEW','QUOTATION_VIEW')) p
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- ROLLBACK (reversible, non-destructive):
--   drop table if exists public.quotation_status_history cascade;
--   drop table if exists public.quotation_lines cascade;
--   drop table if exists public.quotations cascade;
--   drop table if exists public.estimation_operations cascade;
--   drop table if exists public.estimations cascade;
--   drop function if exists public.guard_xt_estimations, public.guard_xt_estimation_operations,
--     public.guard_xt_quotations, public.guard_xt_quotation_lines, public.guard_xt_quotation_status_history cascade;
--   delete from public.hr_role_permissions where permission_key like 'ESTIMATION_%' or permission_key like 'QUOTATION_%';
--   delete from public.hr_permissions where key like 'ESTIMATION_%' or key like 'QUOTATION_%';
-- ============================================================================
