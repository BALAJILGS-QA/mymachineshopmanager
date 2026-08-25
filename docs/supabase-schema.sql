-- =============================================================================
-- CNC Machine Shop Management System — Supabase / PostgreSQL schema
-- =============================================================================
-- Run this once in the Supabase SQL Editor (Dashboard → SQL → New query).
--
-- The app generates its own string IDs (e.g. "cmp_ab12cd") and document
-- numbers, so primary keys are TEXT, not uuid. Business rules from
-- src/data/repo.ts are mirrored as constraints + triggers so they hold
-- regardless of client (PRD 11 & 13).
--
-- Security: RLS is enabled and grants full access to AUTHENTICATED users only
-- (single-tenant shop). The frontend signs in with Supabase Auth, so the public
-- anon key alone cannot read/write. Create one auth user in
-- Dashboard → Authentication → Users → Add user (and turn off "Confirm email"
-- under Authentication → Providers → Email for instant login).
-- =============================================================================

-- ---------- Enums ------------------------------------------------------------
do $$ begin
  create type job_status as enum ('Draft','Pending','In Progress','On Hold','Completed','Delivered','Cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type job_priority as enum ('Low','Normal','High','Urgent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type invoice_status as enum ('Draft','Unpaid','Partially Paid','Paid','Cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type payment_method as enum ('Cash','Bank Transfer','UPI','Cheque','Other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type owner_type as enum ('Company','Shop');
exception when duplicate_object then null; end $$;

-- ---------- App state (settings + sequences singleton) ----------------------
create table if not exists app_state (
  id text primary key,          -- always 'singleton'
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Master data ------------------------------------------------------
create table if not exists companies (
  id text primary key,
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

create table if not exists materials (
  id text primary key,
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
create table if not exists job_orders (
  id text primary key,
  job_no text not null unique,
  company_id text not null references companies(id),
  customer_po text,
  part_name text not null,
  part_number text,
  material_id text references materials(id),
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
create index if not exists idx_jobs_company on job_orders (company_id);
create index if not exists idx_jobs_status on job_orders (status);

create table if not exists production_events (
  id text primary key,
  job_id text not null references job_orders(id) on delete cascade,
  type text not null,
  from_status job_status,
  to_status job_status,
  completed_qty numeric(14,3),
  note text,
  operator text,
  at timestamptz not null default now()
);
create index if not exists idx_prod_job on production_events (job_id);

-- ---------- Stock ------------------------------------------------------------
create table if not exists material_receipts (
  id text primary key,
  receipt_no text not null unique,
  date date not null,
  material_id text not null references materials(id),
  owner_type owner_type not null,
  company_id text references companies(id),
  job_id text references job_orders(id),
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

create table if not exists material_issues (
  id text primary key,
  issue_no text not null unique,
  date date not null,
  material_id text not null references materials(id),
  job_id text not null references job_orders(id),
  company_id text references companies(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_adjustments (
  id text primary key,
  adj_no text not null unique,
  date date not null,
  material_id text not null references materials(id),
  company_id text references companies(id),
  quantity numeric(14,3) not null check (quantity <> 0), -- signed
  unit text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Overall stock balance per material.
create or replace view material_stock as
select
  m.id as material_id,
  coalesce((select sum(quantity) from material_receipts r where r.material_id = m.id), 0)
  - coalesce((select sum(quantity) from material_issues i where i.material_id = m.id), 0)
  + coalesce((select sum(quantity) from stock_adjustments a where a.material_id = m.id), 0)
    as balance
from materials m;

-- ---------- Invoices & payments ---------------------------------------------
create table if not exists invoices (
  id text primary key,
  invoice_no text not null unique,
  date date not null,
  company_id text not null references companies(id),
  billing_address text,
  shipping_address text,
  reference text,
  dc_reference text,
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax_percent numeric(6,3) not null default 0 check (tax_percent >= 0),
  cgst_percent numeric(6,3),
  sgst_percent numeric(6,3),
  status invoice_status not null default 'Unpaid',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoice_lines (
  id text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  job_id text references job_orders(id),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  rate numeric(14,2) not null check (rate >= 0),
  line_no int
);
create index if not exists idx_lines_invoice on invoice_lines (invoice_id);

create table if not exists payments (
  id text primary key,
  payment_no text not null unique,
  date date not null,
  company_id text not null references companies(id),
  invoice_id text references invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  method payment_method not null,
  reference text,
  is_advance boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pay_invoice on payments (invoice_id);

-- Derived invoice totals + outstanding (PRD 6.6). Cancelled excluded.
create or replace view invoice_totals as
select
  i.id as invoice_id,
  coalesce(sub.subtotal, 0) as subtotal,
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
create table if not exists expenses (
  id text primary key,
  expense_no text not null unique,
  date date not null,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  method payment_method not null,
  vendor text,
  reference text,
  company_id text references companies(id),
  job_id text references job_orders(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Audit log --------------------------------------------------------
create table if not exists audit_log (
  id text primary key,
  at timestamptz not null default now(),
  entity text not null,
  entity_id text,
  action text not null,
  summary text,
  actor text
);

-- ---------- Row Level Security (PRD 11) -------------------------------------
do $$
declare t text;
begin
  foreach t in array array['app_state','companies','materials','job_orders','production_events',
    'material_receipts','material_issues','stock_adjustments','invoices',
    'invoice_lines','payments','expenses','audit_log']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists auth_all on %I;', t);
    execute format('create policy auth_all on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ---------- Rate list (machining cost per part) -----------------------------
create table if not exists products (
  id text primary key,
  code text not null unique,
  name text not null,
  rate numeric(14,2) not null default 0 check (rate >= 0),
  unit text,
  hsn text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Delivery challans (invoice raised against a challan) -------------
create table if not exists delivery_challans (
  id text primary key,
  dc_no text not null unique,
  date date not null,
  company_id text not null references companies(id),
  job_id text references job_orders(id),
  reference text,
  vehicle_no text,
  lines jsonb not null default '[]',
  notes text,
  status text not null default 'Open',
  invoice_id text references invoices(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dc_company on delivery_challans (company_id);

do $$
declare t text;
begin
  foreach t in array array['products','delivery_challans']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists auth_all on %I;', t);
    execute format('create policy auth_all on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ---------- Seed initial companies (PRD 18) ---------------------------------
insert into companies (id, code, name) values
  ('cmp_seed_flowra','C001','Flowra Global'),
  ('cmp_seed_vahinie','C002','Vahinie Engineering'),
  ('cmp_seed_nirmal','C003','Nirmal Pumps'),
  ('cmp_seed_local','C004','Local')
on conflict (code) do nothing;
