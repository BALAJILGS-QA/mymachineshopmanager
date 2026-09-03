-- ============================================================================
-- GST core: company GST registrations, configurable tax-rate slabs, HSN/SAC
-- master, GST return staging (GSTR-1 / GSTR-3B preparation), and the e-invoice /
-- e-way-bill data models with provider + status fields.
-- ============================================================================
-- Design notes
--  • Builds on 0022 (finance permissions). Additive + idempotent. Reuses the
--    existing invoices / companies (gstin) / products (hsn) — no duplication.
--  • NO tax rate or jurisdiction rule is hardcoded in logic: slabs are data in
--    gst_tax_rates; intra/inter-state split is computed by a service from the
--    place-of-supply vs supplier state (see the frontend gstCalc).
--  • E-invoice / e-way rows store provider + request/response metadata so an IRP/
--    GSP integration can be plugged in later WITHOUT schema change. Secrets are
--    never stored here — they live in server env / a secret manager.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Company GST registrations (supports multiple GSTINs / locations)
-- ---------------------------------------------------------------------------
create table if not exists public.gst_registrations (
  id                text primary key,
  company_id        text references public.companies(id),
  legal_name        text not null,
  trade_name        text,
  gstin             text not null,
  registration_type text,                          -- regular|composition|casual|sez|…
  state             text,
  state_code        text,                           -- 2-digit GST state code
  pan               text,
  address           text,
  effective_date    date,
  status            text not null default 'active' check (status in ('active','inactive')),
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists idx_gstreg_gstin on public.gst_registrations (lower(gstin));
create index if not exists idx_gstreg_company on public.gst_registrations (company_id);

-- ---------------------------------------------------------------------------
-- 2. Configurable tax-rate slabs (CGST/SGST/IGST/cess). NOT hardcoded.
-- ---------------------------------------------------------------------------
create table if not exists public.gst_tax_rates (
  id          text primary key,
  name        text not null,                        -- 'GST 18%'
  total_rate  numeric not null,                     -- 18
  cgst        numeric not null default 0,           -- 9
  sgst        numeric not null default 0,           -- 9
  igst        numeric not null default 0,           -- 18
  cess        numeric not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. HSN / SAC master (links to a default rate; integrates with products.hsn)
-- ---------------------------------------------------------------------------
create table if not exists public.hsn_codes (
  id            text primary key,
  code          text not null,
  kind          text not null default 'hsn' check (kind in ('hsn','sac')),
  description   text,
  tax_rate_id   text references public.gst_tax_rates(id),
  unit          text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists idx_hsn_code on public.hsn_codes (kind, lower(code));

-- ---------------------------------------------------------------------------
-- 4. GST return staging (preparation ≠ filing). One row per period+type.
-- ---------------------------------------------------------------------------
create table if not exists public.gst_return_periods (
  id            text primary key,
  company_id    text references public.companies(id),
  gstin         text,
  period        text not null,                      -- 'YYYY-MM'
  return_type   text not null check (return_type in ('GSTR1','GSTR3B','GSTR2B')),
  status        text not null default 'draft' check (status in ('draft','prepared','exported','filed')),
  summary       jsonb not null default '{}'::jsonb, -- computed section totals
  prepared_by   text,
  prepared_at   timestamptz,
  filed_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists idx_gstret_uniq
  on public.gst_return_periods (coalesce(company_id,'*'), coalesce(gstin,'*'), period, return_type);

-- ---------------------------------------------------------------------------
-- 5. E-invoice records (IRN lifecycle). Provider-abstracted.
-- ---------------------------------------------------------------------------
create table if not exists public.einvoice_records (
  id            text primary key,
  invoice_id    text references public.invoices(id) on delete cascade,
  company_id    text references public.companies(id),
  status        text not null default 'pending'
                check (status in ('not_applicable','pending','submitted','generated','failed','cancelled')),
  provider      text,                               -- configured IRP/GSP name
  request_id    text,
  irn           text,
  ack_no        text,
  ack_date      timestamptz,
  signed_qr     text,
  qr_data       text,
  error_code    text,
  error_message text,
  cancel_reason text,
  cancelled_at  timestamptz,
  payload       jsonb,                              -- request/response metadata (no secrets)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_einv_invoice on public.einvoice_records (invoice_id);
create index if not exists idx_einv_irn on public.einvoice_records (irn);

-- ---------------------------------------------------------------------------
-- 6. E-way bills. Provider-abstracted; official payload fields, not invented.
-- ---------------------------------------------------------------------------
create table if not exists public.eway_bills (
  id                    text primary key,
  invoice_id            text references public.invoices(id) on delete set null,
  company_id            text references public.companies(id),
  ewb_number            text,
  document_no           text,
  document_type         text,                       -- INV|BIL|BOE|CHL|OTH
  document_date         date,
  supplier_gstin        text,
  recipient_gstin       text,
  from_address          text,
  to_address            text,
  from_pincode          text,
  to_pincode            text,
  items                 jsonb not null default '[]'::jsonb,  -- [{hsn, qty, taxable_value, rate}]
  taxable_value         numeric,
  invoice_value         numeric,
  transporter_id        text,
  transporter_name      text,
  transport_mode        text,                       -- road|rail|air|ship
  vehicle_number        text,
  transport_doc_number  text,
  transport_doc_date    date,
  distance_km           int,
  generated_date        timestamptz,
  valid_until           timestamptz,
  status                text not null default 'draft'
                        check (status in ('draft','generated','cancelled','rejected','expired')),
  cancellation_date     timestamptz,
  provider              text,
  response_meta         jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_ewb_invoice on public.eway_bills (invoice_id);
create index if not exists idx_ewb_number on public.eway_bills (ewb_number);

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
do $$
declare spec record;
begin
  for spec in
    select * from (values
      ('gst_registrations',  'GST_VIEW', 'GST_MANAGE'),
      ('gst_tax_rates',      'GST_VIEW', 'GST_MANAGE'),
      ('hsn_codes',          'GST_VIEW', 'GST_MANAGE'),
      ('gst_return_periods', 'GST_VIEW', 'GST_MANAGE'),
      ('einvoice_records',   'GST_VIEW', 'EINVOICE_MANAGE'),
      ('eway_bills',         'GST_VIEW', 'EWAYBILL_MANAGE')
    ) as t(tbl, read_perm, write_perm)
  loop
    execute format('alter table public.%I enable row level security;', spec.tbl);
    execute format('drop policy if exists p_read on public.%I;', spec.tbl);
    execute format($f$create policy p_read on public.%I for select to authenticated
      using (public.is_app_approved() and (public.hr_has_permission(%L) or public.is_hr_admin()));$f$,
      spec.tbl, spec.read_perm);
    execute format('drop policy if exists p_write on public.%I;', spec.tbl);
    execute format($f$create policy p_write on public.%I for all to authenticated
      using (public.hr_has_permission(%L) or public.is_hr_admin())
      with check (public.hr_has_permission(%L) or public.is_hr_admin());$f$,
      spec.tbl, spec.write_perm, spec.write_perm);
  end loop;
end $$;

-- Tax rates + HSN are reference data every approved finance user needs to read.
do $$
declare t text;
begin
  foreach t in array array['gst_tax_rates','hsn_codes'] loop
    execute format('drop policy if exists p_read on public.%I;', t);
    execute format($f$create policy p_read on public.%I for select to authenticated
      using (public.is_app_approved());$f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Seed — common Indian GST slabs (configurable; edit/extend freely)
-- ---------------------------------------------------------------------------
insert into public.gst_tax_rates (id, name, total_rate, cgst, sgst, igst, cess) values
  ('gst_0',  'GST 0% (Exempt)', 0,  0,   0,   0,  0),
  ('gst_5',  'GST 5%',          5,  2.5, 2.5, 5,  0),
  ('gst_12', 'GST 12%',         12, 6,   6,   12, 0),
  ('gst_18', 'GST 18%',         18, 9,   9,   18, 0),
  ('gst_28', 'GST 28%',         28, 14,  14,  28, 0)
on conflict (id) do nothing;
