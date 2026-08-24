// Adds products (rate list) and delivery_challans tables + RLS. Idempotent.
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pg = require('pg')

const client = new pg.Client({
  host: 'db.ydhvsiixwmbxoumglpvq.supabase.co', port: 5432, user: 'postgres',
  password: process.env.SUPA_DB_PASS, database: 'postgres',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
})
await client.connect()
await client.query(`
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

  alter table products enable row level security;
  alter table delivery_challans enable row level security;
  drop policy if exists auth_all on products;
  create policy auth_all on products for all to authenticated using (true) with check (true);
  drop policy if exists auth_all on delivery_challans;
  create policy auth_all on delivery_challans for all to authenticated using (true) with check (true);
`)
console.log('DC_PRODUCTS_MIGRATION_DONE')
const r = await client.query("select (select count(*) from products) p, (select count(*) from delivery_challans) d")
console.log('products:', r.rows[0].p, 'challans:', r.rows[0].d)
await client.end()
