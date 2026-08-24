-- =============================================================================
-- CNC Machine Shop Management System — Supabase / PostgreSQL schema
-- =============================================================================
-- This is the production upgrade path for the MVP. The shipped app runs on a
-- browser-local store (zero backend, free on Netlify). To move to a hosted,
-- multi-user backend, run this in the Supabase SQL editor and point the
-- repository layer (src/data/repo.ts) at Supabase via @supabase/supabase-js.
--
-- Business rules that live in src/data/repo.ts are mirrored here as database
-- constraints + triggers so they hold regardless of client (PRD 11 & 13).
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ------------------------------------------------------------
create type job_status   as enum ('Draft','Pending','In Progress','On Hold','Completed','Delivered','Cancelled');
create type job_priority as enum ('Low','Normal','High','Urgent');
create type invoice_status as enum ('Draft','Unpaid','Partially Paid','Paid','Cancelled');
create type payment_method as enum ('Cash','Bank Transfer','UPI','Cheque','Other');
create type owner_type   as enum ('Company','Shop');

-- ---------- Master data ------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact_person text,
  phone text,
  email text,
  billing_address text,
  gstin text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text,
  unit text not null,
  description text,
  default_rate numeric(14,2),
  reorder_level numeric(14,3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Job orders -------------------------------------------------------
create table job_orders (
  id uuid primary key default gen_random_uuid(),
  job_no text not null unique,
  company_id uuid not null references companies(id),
  customer_po text,
  part_name text not null,
  part_number text,
  material_id uuid references materials(id),
  ordered_qty numeric(14,3) not null check (ordered_qty > 0),
  completed_qty numeric(14,3) not null default 0 check (completed_qty >= 0),
  rate numeric(14,2),
  order_date date not null,
  due_date date,
  priority job_priority not null default 'Normal',
  status job_status not null default 'Pending',
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  operator text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on job_orders (company_id);
create index on job_orders (status);

create table production_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job_orders(id) on delete cascade,
  type text not null,
  from_status job_status,
  to_status job_status,
  completed_qty numeric(14,3),
  note text,
  operator text,
  at timestamptz not null default now()
);
create index on production_events (job_id);

-- ---------- Stock ------------------------------------------------------------
create table material_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  date date not null,
  material_id uuid not null references materials(id),
  owner_type owner_type not null,
  company_id uuid references companies(id),
  job_id uuid references job_orders(id),
  supplier text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  rate numeric(14,2),
  batch_no text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table material_issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text not null unique,
  date date not null,
  material_id uuid not null references materials(id),
  job_id uuid not null references job_orders(id),
  company_id uuid references companies(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  adj_no text not null unique,
  date date not null,
  material_id uuid not null references materials(id),
  company_id uuid references companies(id),
  quantity numeric(14,3) not null check (quantity <> 0), -- signed
  unit text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Current stock balance per material (overall pool). Company-wise views can
-- filter the underlying tables by company_id.
create view material_stock as
select
  m.id as material_id,
  coalesce((select sum(quantity) from material_receipts r where r.material_id = m.id), 0)
  - coalesce((select sum(quantity) from material_issues i where i.material_id = m.id), 0)
  + coalesce((select sum(quantity) from stock_adjustments a where a.material_id = m.id), 0)
    as balance
from materials m;

-- Guard: block an issue that would drive overall stock negative (PRD 13).
create or replace function check_stock_non_negative() returns trigger as $$
declare
  bal numeric;
begin
  select balance into bal from material_stock where material_id = new.material_id;
  if (bal - new.quantity) < 0 then
    raise exception 'Insufficient stock for material % (available %)', new.material_id, bal;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_issue_stock_guard
  before insert on material_issues
  for each row execute function check_stock_non_negative();

-- ---------- Invoices & payments ---------------------------------------------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  date date not null,
  company_id uuid not null references companies(id),
  billing_address text,
  reference text,
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax_percent numeric(6,3) not null default 0 check (tax_percent >= 0),
  status invoice_status not null default 'Unpaid',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  job_id uuid references job_orders(id),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  rate numeric(14,2) not null check (rate >= 0),
  line_no int
);
create index on invoice_lines (invoice_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text not null unique,
  date date not null,
  company_id uuid not null references companies(id),
  invoice_id uuid references invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  method payment_method not null,
  reference text,
  is_advance boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on payments (invoice_id);

-- Derived invoice totals + outstanding (PRD 6.6). Cancelled invoices excluded.
create view invoice_totals as
select
  i.id as invoice_id,
  coalesce(sub.subtotal, 0) as subtotal,
  greatest(coalesce(sub.subtotal,0) - i.discount, 0) as taxable,
  round(greatest(coalesce(sub.subtotal,0) - i.discount,0) * i.tax_percent / 100, 2) as tax_amount,
  round(greatest(coalesce(sub.subtotal,0) - i.discount,0) * (1 + i.tax_percent/100), 2) as total,
  case when i.status = 'Cancelled' then 0 else coalesce(pay.paid,0) end as paid,
  case when i.status = 'Cancelled' then 0
       else round(greatest(coalesce(sub.subtotal,0) - i.discount,0) * (1 + i.tax_percent/100),2) - coalesce(pay.paid,0)
  end as outstanding
from invoices i
left join (
  select invoice_id, sum(quantity * rate) as subtotal from invoice_lines group by invoice_id
) sub on sub.invoice_id = i.id
left join (
  select invoice_id, sum(amount) as paid from payments where invoice_id is not null group by invoice_id
) pay on pay.invoice_id = i.id;

-- ---------- Expenses ---------------------------------------------------------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  date date not null,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  method payment_method not null,
  vendor text,
  reference text,
  company_id uuid references companies(id),
  job_id uuid references job_orders(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Audit log --------------------------------------------------------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  entity text not null,
  entity_id uuid,
  action text not null,
  summary text,
  actor uuid
);

-- ---------- updated_at trigger ----------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['companies','materials','job_orders','material_receipts',
    'material_issues','stock_adjustments','invoices','payments','expenses']
  loop
    execute format('create trigger trg_touch_%1$s before update on %1$s
      for each row execute function touch_updated_at();', t);
  end loop;
end $$;

-- ---------- Row Level Security (PRD 11) -------------------------------------
-- Authenticated staff get full access in this single-tenant MVP. Tighten per
-- company / role when staff logins are introduced (Phase 2).
alter table companies         enable row level security;
alter table materials         enable row level security;
alter table job_orders        enable row level security;
alter table production_events enable row level security;
alter table material_receipts enable row level security;
alter table material_issues   enable row level security;
alter table stock_adjustments enable row level security;
alter table invoices          enable row level security;
alter table invoice_lines     enable row level security;
alter table payments          enable row level security;
alter table expenses          enable row level security;
alter table audit_log         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['companies','materials','job_orders','production_events',
    'material_receipts','material_issues','stock_adjustments','invoices',
    'invoice_lines','payments','expenses','audit_log']
  loop
    execute format($f$create policy "auth_all_%1$s" on %1$s
      for all to authenticated using (true) with check (true);$f$, t);
  end loop;
end $$;

-- ---------- Seed initial companies (PRD 18) ---------------------------------
insert into companies (code, name) values
  ('C001','Flowra Global'),
  ('C002','Vahinie Engineering'),
  ('C003','Nirmal Pumps'),
  ('C004','Local')
on conflict (code) do nothing;
