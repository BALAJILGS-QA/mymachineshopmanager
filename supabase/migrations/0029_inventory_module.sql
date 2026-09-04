-- ============================================================================
-- Inventory module: Stock Transfers + Inventory RBAC
-- ============================================================================
-- This migration is part of promoting Materials & Stock into a top-level
-- Inventory module. It is PURELY ADDITIVE:
--   • It does NOT touch the existing stock source-of-truth (materials,
--     material_receipts, material_issues, stock_adjustments, own_material_purchases,
--     the material_receipt_stock / inventory_ledger views, or their RPCs). Those
--     remain the single source of truth for material stock; Dashboard, Stock
--     Movements, Stock History and Reports are read-only views over them.
--   • It adds ONE genuinely new capability — Stock Transfers — as a document
--     workflow (there is no location dimension on material stock today, so a
--     transfer is an inter-location movement record; it never mutates owner-scoped
--     balances, so it cannot corrupt existing stock figures).
--   • It adds INVENTORY_* permission keys to the shared RBAC catalog (migration
--     0019). Existing Materials & Stock behaviour is unchanged: the client keeps
--     the "unconfigured RBAC → any approved user can act" bootstrap.
-- Idempotent + additive (create ... if not exists / on conflict do nothing).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Stock transfers (inter-location movement documents)
-- ---------------------------------------------------------------------------
create table if not exists public.stock_transfers (
  id            text primary key,
  transfer_no   text,
  material_id   text not null references public.materials(id) on delete cascade,
  company_id    text references public.companies(id),   -- null = own/shop scope
  from_location text not null,
  to_location   text not null,
  quantity      numeric not null check (quantity > 0),
  unit          text,
  transfer_date date not null default current_date,
  requested_by  text,
  approved_by   text,
  status        text not null default 'draft'
                check (status in ('draft','requested','approved','in_transit','completed','cancelled')),
  remarks       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists idx_stock_transfers_material on public.stock_transfers (material_id);
create index if not exists idx_stock_transfers_status   on public.stock_transfers (status);
create index if not exists idx_stock_transfers_date     on public.stock_transfers (transfer_date desc);

alter table public.stock_transfers enable row level security;
drop policy if exists inv_transfers_read on public.stock_transfers;
create policy inv_transfers_read on public.stock_transfers for select to authenticated
  using (public.is_app_approved());
drop policy if exists inv_transfers_write on public.stock_transfers;
create policy inv_transfers_write on public.stock_transfers for all to authenticated
  using (public.is_app_approved()) with check (public.is_app_approved());

-- ---------------------------------------------------------------------------
-- 2. RBAC — extend the shared permission catalog + grant to existing roles
-- ---------------------------------------------------------------------------
insert into public.hr_permissions (key, module, label, description, sort) values
  ('INVENTORY_VIEW',      'Inventory', 'View Inventory',        'Access the Inventory area and dashboard', 300),
  ('INVENTORY_MATERIAL_VIEW',   'Inventory', 'View materials',  'View materials & stock',                  301),
  ('INVENTORY_MATERIAL_MANAGE', 'Inventory', 'Manage materials','Create/edit/delete materials',            302),
  ('INVENTORY_STOCK_VIEW',      'Inventory', 'View stock',      'View stock, movements & history',         303),
  ('INVENTORY_ADJUST',    'Inventory', 'Adjust stock',          'Post stock adjustments',                  304),
  ('INVENTORY_TRANSFER',  'Inventory', 'Transfer stock',        'Create/approve stock transfers',          305),
  ('INVENTORY_REPORT',    'Inventory', 'Inventory reports',     'View & export inventory reports',         306)
on conflict (key) do update
  set module = excluded.module, label = excluded.label,
      description = excluded.description, sort = excluded.sort;

-- HR Admin already gets every catalog permission via the 0019 "all keys" grant;
-- re-applied here idempotently so a fresh apply order is safe.
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_admin', key, 'all' from public.hr_permissions where key like 'INVENTORY_%'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- HR Manager: operate inventory company-wide.
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_manager', key, 'company' from public.hr_permissions where key like 'INVENTORY_%'
on conflict (role_id, permission_key) do update set scope = excluded.scope;
