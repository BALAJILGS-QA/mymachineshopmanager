-- ============================================================================
-- Production Planning — Phase 4: Masters (Work Centers / Machines / Operations /
-- Routings) + per-order operation sequence
-- ============================================================================
-- Fills the GENUINE GAP confirmed missing on prod: there is no machine /
-- work-center / operation / routing master anywhere. This migration adds them,
-- plus the per-production-order operation list that the Production Order
-- "Operations" tab renders (today an honest placeholder).
--
-- Model:
--   • work_centers  — a production cell / cost-centre.
--   • machines       — a physical machine, optionally in a work centre.
--   • operations     — the standard operation catalogue (Turning, Milling, …).
--   • routings       — a reusable process plan, optionally tied to a material.
--   • routing_steps  — the ordered operations that make up a routing.
--   • job_operations — the operation sequence attached to ONE production order.
--     Snapshots the operation/work-centre/machine NAMES at attach time so the
--     order's plan is stable even if a master is later renamed. Phase 4 is
--     plan/display only (status defaults 'Planned'); per-operation EXECUTION
--     (start/complete, time capture) is Phase 5.
--
-- Masters + job_operations are simple master-/config-grade data: tenant RLS
-- allows the tenant to read AND write (CRUD), matching the Tool Room masters
-- (0028). The one rule-bearing action — copying a routing's steps onto an order
-- — is the SECURITY DEFINER instantiate_routing() RPC (permission-checked,
-- atomic, audited). Cross-tenant reference guards (0046 pattern) stop a row from
-- pointing at another tenant's parent.
--
-- Additive + idempotent. Touches no existing row. Next free number after 0074.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.work_centers (
  id          text primary key,
  code        text,
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  tenant_id   text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_work_centers_tenant on public.work_centers (tenant_id);
create unique index if not exists uq_work_centers_code_tenant
  on public.work_centers (tenant_id, code) where code is not null;

create table if not exists public.machines (
  id             text primary key,
  code           text,
  name           text not null,
  machine_type   text,
  work_center_id text references public.work_centers(id) on delete set null,
  status         text not null default 'Active',   -- Active | Maintenance | Inactive
  hourly_rate    numeric,
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  tenant_id      text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_machines_tenant on public.machines (tenant_id);
create index if not exists idx_machines_wc on public.machines (work_center_id);
create unique index if not exists uq_machines_code_tenant
  on public.machines (tenant_id, code) where code is not null;

create table if not exists public.operations (
  id                     text primary key,
  code                   text,
  name                   text not null,
  description            text,
  default_work_center_id text references public.work_centers(id) on delete set null,
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  tenant_id              text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_operations_tenant on public.operations (tenant_id);
create unique index if not exists uq_operations_code_tenant
  on public.operations (tenant_id, code) where code is not null;

create table if not exists public.routings (
  id          text primary key,
  code        text,
  name        text not null,
  material_id text references public.materials(id) on delete set null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  tenant_id   text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_routings_tenant on public.routings (tenant_id);
create index if not exists idx_routings_material on public.routings (material_id);
create unique index if not exists uq_routings_code_tenant
  on public.routings (tenant_id, code) where code is not null;

create table if not exists public.routing_steps (
  id             text primary key,
  routing_id     text not null references public.routings(id) on delete cascade,
  seq            integer not null,
  operation_id   text references public.operations(id) on delete set null,
  work_center_id text references public.work_centers(id) on delete set null,
  machine_id     text references public.machines(id) on delete set null,
  setup_min      numeric,
  cycle_min      numeric,          -- per-unit cycle minutes
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  tenant_id      text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_routing_steps_tenant on public.routing_steps (tenant_id);
create index if not exists idx_routing_steps_routing on public.routing_steps (routing_id, seq);

create table if not exists public.job_operations (
  id                text primary key,
  job_id            text not null references public.job_orders(id) on delete cascade,
  seq               integer not null,
  operation_id      text references public.operations(id) on delete set null,
  operation_name    text,            -- snapshot label (survives master edits)
  work_center_id    text references public.work_centers(id) on delete set null,
  work_center_name  text,
  machine_id        text references public.machines(id) on delete set null,
  machine_name      text,
  setup_min         numeric,
  cycle_min         numeric,
  status            text not null default 'Planned',  -- Planned | In Progress | Completed | Skipped (execution = Phase 5)
  notes             text,
  source_routing_id text references public.routings(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  tenant_id         text not null default public.current_tenant_id() references public.tenants(id)
);
create index if not exists idx_job_operations_tenant on public.job_operations (tenant_id);
create index if not exists idx_job_operations_job on public.job_operations (job_id, seq);

-- ---------------------------------------------------------------------------
-- 2. RLS — tenant-scoped read AND write (master-/config-grade CRUD)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'work_centers','machines','operations','routings','routing_steps','job_operations'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_tenant_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));',
      t || '_tenant_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cross-tenant reference guards (0046 pattern, reuse assert_ref_tenant)
-- ---------------------------------------------------------------------------
create or replace function public.guard_xt_machines()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.work_centers', new.work_center_id);
  return new;
end $$;
drop trigger if exists trg_xt_machines on public.machines;
create trigger trg_xt_machines before insert or update on public.machines
  for each row execute function public.guard_xt_machines();

create or replace function public.guard_xt_operations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.work_centers', new.default_work_center_id);
  return new;
end $$;
drop trigger if exists trg_xt_operations on public.operations;
create trigger trg_xt_operations before insert or update on public.operations
  for each row execute function public.guard_xt_operations();

create or replace function public.guard_xt_routings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.materials', new.material_id);
  return new;
end $$;
drop trigger if exists trg_xt_routings on public.routings;
create trigger trg_xt_routings before insert or update on public.routings
  for each row execute function public.guard_xt_routings();

create or replace function public.guard_xt_routing_steps()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.routings',     new.routing_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.operations',   new.operation_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.work_centers', new.work_center_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.machines',     new.machine_id);
  return new;
end $$;
drop trigger if exists trg_xt_routing_steps on public.routing_steps;
create trigger trg_xt_routing_steps before insert or update on public.routing_steps
  for each row execute function public.guard_xt_routing_steps();

create or replace function public.guard_xt_job_operations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.job_orders',   new.job_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.operations',   new.operation_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.work_centers', new.work_center_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.machines',     new.machine_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.routings',     new.source_routing_id);
  return new;
end $$;
drop trigger if exists trg_xt_job_operations on public.job_operations;
create trigger trg_xt_job_operations before insert or update on public.job_operations
  for each row execute function public.guard_xt_job_operations();

-- ---------------------------------------------------------------------------
-- 4. instantiate_routing() — copy a routing's steps onto a production order
-- ---------------------------------------------------------------------------
create or replace function public.instantiate_routing(
  p_job_id text, p_routing_id text, p_replace boolean default true)
returns setof public.job_operations
language plpgsql security definer set search_path = public as $$
declare j public.job_orders;
begin
  if not public.prod_can('MASTERS_MANAGE') then
    raise exception 'Not authorized: MASTERS_MANAGE';
  end if;
  select * into j from public.job_orders where id = p_job_id;
  if not found then raise exception 'Production order not found'; end if;
  if not exists (select 1 from public.routings where id = p_routing_id) then
    raise exception 'Routing not found';
  end if;

  if coalesce(p_replace, true) then
    delete from public.job_operations where job_id = p_job_id;
  end if;

  insert into public.job_operations (
    id, job_id, seq, operation_id, operation_name, work_center_id, work_center_name,
    machine_id, machine_name, setup_min, cycle_min, status, notes, source_routing_id)
  select
    'jop_' || left(replace(gen_random_uuid()::text, '-', ''), 16),
    p_job_id, s.seq, s.operation_id, o.name, s.work_center_id, wc.name,
    s.machine_id, m.name, s.setup_min, s.cycle_min, 'Planned', s.notes, p_routing_id
  from public.routing_steps s
  left join public.operations    o  on o.id  = s.operation_id
  left join public.work_centers  wc on wc.id = s.work_center_id
  left join public.machines      m  on m.id  = s.machine_id
  where s.routing_id = p_routing_id
  order by s.seq;

  perform public.hr_log(
    'instantiate_routing', 'job', p_job_id,
    concat('Attached routing to ', j.job_no),
    null, jsonb_build_object('routing_id', p_routing_id, 'replace', coalesce(p_replace, true)),
    j.company_id, null);

  return query select * from public.job_operations where job_id = p_job_id order by seq;
end $$;

-- ---------------------------------------------------------------------------
-- 5. RBAC — Masters permissions in the shared Production catalogue
-- ---------------------------------------------------------------------------
insert into public.hr_permissions (key, module, label, description, sort) values
  ('MASTERS_VIEW',   'Production', 'View masters',   'View machines, work centres, operations and routings',          320),
  ('MASTERS_MANAGE', 'Production', 'Manage masters', 'Create/edit masters, routings, and attach routings to orders', 321)
on conflict (key) do nothing;

-- VIEW to the broad production set; MANAGE to admin/manager/prod_manager.
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_admin', key, 'all' from public.hr_permissions
  where key in ('MASTERS_VIEW', 'MASTERS_MANAGE')
on conflict do nothing;

insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_manager', key, 'company' from public.hr_permissions
  where key in ('MASTERS_VIEW', 'MASTERS_MANAGE')
on conflict do nothing;

insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_prod_manager', key, 'company' from public.hr_permissions
  where key in ('MASTERS_VIEW', 'MASTERS_MANAGE')
on conflict do nothing;

insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_prod_operator', 'MASTERS_VIEW', 'team'
on conflict do nothing;

insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_qc_inspector', 'MASTERS_VIEW', 'company'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.instantiate_routing(text, text, boolean) to authenticated;
