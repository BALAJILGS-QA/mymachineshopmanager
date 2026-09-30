-- ============================================================================
-- Invoice Payment & Settlement — part 2: schema (tables, view rework, backfill).
-- ============================================================================
-- Introduces the normalized allocation + deduction layer WITHOUT breaking the
-- existing single-invoice payment model:
--
--   payments (unchanged) ──< payment_allocations >── invoices     (many↔many)
--                        └──< payment_deductions >── invoices     (optional)
--
-- Key backward-compat rule (see the reworked invoice_totals below):
--   paid(invoice) = Σ allocations for that invoice
--                 + Σ direct-link payments (payments.invoice_id) that have NO
--                   allocation row (legacy create_payment / bank-import path).
-- The backfill at the end gives EVERY existing direct-link payment an allocation
-- row, so the legacy fallback only ever counts FUTURE direct writes — no double
-- counting, and paid stays byte-identical to the pre-migration value.
--
-- Deductions carry a known/unknown distinction. type='Unidentified' is the
-- "customer paid less, reason not yet given" bucket; reclassifying it into real
-- types is an audited edit (RPC in 0057). settled = paid + known + unknown, so an
-- invoice reconciled purely by a recorded unknown diff closes as 'Settled'
-- (enum added in 0055) while the unknown amount still surfaces in the Unknown
-- Deduction follow-up report.
--
-- GL-NEUTRAL: no journals here. Ledger posting is a future phase.
-- Additive. No DROP of data. tenant_id + RLS follow the 0044 uniform pattern.
-- Idempotent: create ... if not exists; guarded backfill.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. payment_allocations — money from one payment applied to one invoice.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_allocations (
  id          text primary key,
  payment_id  text not null references public.payments(id) on delete cascade,
  invoice_id  text not null references public.invoices(id),
  amount      numeric(14,2) not null check (amount > 0),
  tenant_id   text not null default public.current_tenant_id(),
  created_at  timestamptz not null default now(),
  created_by  text
);
create index if not exists idx_pay_alloc_payment on public.payment_allocations (payment_id);
create index if not exists idx_pay_alloc_invoice on public.payment_allocations (invoice_id);
create index if not exists idx_payment_allocations_tenant on public.payment_allocations (tenant_id);

-- ---------------------------------------------------------------------------
-- 2. payment_deductions — optional TDS / freight / etc. + the unknown bucket.
--    deduction_type is a CHECK'd text (not an enum) so the set can grow without
--    an enum-migration dance; it can graduate to a master table later if needed.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_deductions (
  id             text primary key,
  payment_id     text not null references public.payments(id) on delete cascade,
  invoice_id     text references public.invoices(id),        -- which invoice it reduces (settlement math counts only rows with an invoice_id)
  deduction_type text not null check (deduction_type in
                   ('TDS','Transportation','Freight','Commission','Retention','Discount','Other','Unidentified')),
  calc_type      text not null default 'fixed' check (calc_type in ('percent','fixed')),
  rate           numeric(9,4),                                -- percentage when calc_type='percent'
  amount         numeric(14,2) not null check (amount >= 0),
  reference      text,
  remarks        text,
  tenant_id      text not null default public.current_tenant_id(),
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create index if not exists idx_pay_ded_payment on public.payment_deductions (payment_id);
create index if not exists idx_pay_ded_invoice on public.payment_deductions (invoice_id);
create index if not exists idx_pay_ded_type    on public.payment_deductions (deduction_type);
create index if not exists idx_payment_deductions_tenant on public.payment_deductions (tenant_id);

-- ---------------------------------------------------------------------------
-- 3. RLS — uniform tenant isolation (matches 0044). Written by SECURITY INVOKER
--    settlement RPCs, so the standard for-all policy applies to the caller.
-- ---------------------------------------------------------------------------
alter table public.payment_allocations enable row level security;
drop policy if exists tenant_isolation on public.payment_allocations;
create policy tenant_isolation on public.payment_allocations for all to authenticated
  using (public.has_tenant_access(tenant_id))
  with check (public.has_tenant_access(tenant_id));

alter table public.payment_deductions enable row level security;
drop policy if exists tenant_isolation on public.payment_deductions;
create policy tenant_isolation on public.payment_deductions for all to authenticated
  using (public.has_tenant_access(tenant_id))
  with check (public.has_tenant_access(tenant_id));

-- ---------------------------------------------------------------------------
-- 4. Cross-tenant reference guards (defense in depth — mirrors 0046).
-- ---------------------------------------------------------------------------
create or replace function public.guard_xt_payment_allocations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.payments', new.payment_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.invoices', new.invoice_id);
  return new;
end $$;
drop trigger if exists trg_xt_payment_allocations on public.payment_allocations;
create trigger trg_xt_payment_allocations before insert or update on public.payment_allocations
  for each row execute function public.guard_xt_payment_allocations();

create or replace function public.guard_xt_payment_deductions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_ref_tenant(new.tenant_id, 'public.payments', new.payment_id);
  perform public.assert_ref_tenant(new.tenant_id, 'public.invoices', new.invoice_id);
  return new;
end $$;
drop trigger if exists trg_xt_payment_deductions on public.payment_deductions;
create trigger trg_xt_payment_deductions before insert or update on public.payment_deductions
  for each row execute function public.guard_xt_payment_deductions();

-- ---------------------------------------------------------------------------
-- 5. Backfill: one allocation per existing direct-link payment.
--    Runs as migration owner (bypasses RLS) → backfills every tenant. Deterministic
--    id keeps it idempotent. tenant_id/created_at copied so guards + history hold.
--    is_advance is NOT filtered: the old view counted ANY payment with an
--    invoice_id as paid, so we mirror that exactly to preserve `paid`.
-- ---------------------------------------------------------------------------
insert into public.payment_allocations (id, payment_id, invoice_id, amount, tenant_id, created_at)
select 'pal_' || p.id, p.id, p.invoice_id, p.amount, p.tenant_id, p.created_at
from public.payments p
where p.invoice_id is not null
  and not exists (select 1 from public.payment_allocations a where a.payment_id = p.id);

-- ---------------------------------------------------------------------------
-- 6. Rework invoice_totals. subtotal/tax_amount/total UNCHANGED (still tax_percent,
--    which the form keeps == cgst+sgst). Adds allocated / known_deductions /
--    unknown_deduction / settled; paid & outstanding redefined per the rule above.
--    Column order preserved for the first six (existing consumers select by name).
-- ---------------------------------------------------------------------------
-- NOTE: the first six output columns (invoice_id, subtotal, tax_amount, total,
-- paid, outstanding) MUST stay in this exact order — CREATE OR REPLACE VIEW can
-- only APPEND columns, not reorder/rename. The new deduction columns are added
-- at the END. Consumers select by name, so column position is irrelevant.
create or replace view invoice_totals as
select
  i.id as invoice_id,
  coalesce(sub.subtotal, 0) as subtotal,
  round(greatest(coalesce(sub.subtotal,0) - i.discount,0) * i.tax_percent / 100, 2) as tax_amount,
  round(greatest(coalesce(sub.subtotal,0) - i.discount,0) * (1 + i.tax_percent/100), 2) as total,
  -- paid = allocations + legacy direct-link payments with no allocation row
  case when i.status = 'Cancelled' then 0
       else round(coalesce(alloc.allocated,0) + coalesce(legacy.legacy_paid,0), 2) end as paid,
  -- outstanding = total − settled (settled defined below)
  case when i.status = 'Cancelled' then 0
       else round(
              round(greatest(coalesce(sub.subtotal,0) - i.discount,0) * (1 + i.tax_percent/100),2)
              - (coalesce(alloc.allocated,0) + coalesce(legacy.legacy_paid,0)
                 + coalesce(ded.known,0) + coalesce(ded.unknown_amt,0)), 2)
  end as outstanding,
  case when i.status = 'Cancelled' then 0
       else round(coalesce(ded.known,0), 2) end as known_deductions,
  case when i.status = 'Cancelled' then 0
       else round(coalesce(ded.unknown_amt,0), 2) end as unknown_deduction,
  -- settled = paid + known + unknown deductions (money reconciled against the invoice)
  case when i.status = 'Cancelled' then 0
       else round(coalesce(alloc.allocated,0) + coalesce(legacy.legacy_paid,0)
                  + coalesce(ded.known,0) + coalesce(ded.unknown_amt,0), 2) end as settled
from invoices i
left join (
  select invoice_id, sum(quantity * rate) as subtotal
  from invoice_lines group by invoice_id
) sub on sub.invoice_id = i.id
left join (
  select invoice_id, sum(amount) as allocated
  from payment_allocations group by invoice_id
) alloc on alloc.invoice_id = i.id
left join (
  select p.invoice_id, sum(p.amount) as legacy_paid
  from payments p
  where p.invoice_id is not null
    and not exists (select 1 from payment_allocations a where a.payment_id = p.id)
  group by p.invoice_id
) legacy on legacy.invoice_id = i.id
left join (
  select invoice_id,
         sum(amount) filter (where deduction_type <> 'Unidentified') as known,
         sum(amount) filter (where deduction_type =  'Unidentified') as unknown_amt
  from payment_deductions
  where invoice_id is not null
  group by invoice_id
) ded on ded.invoice_id = i.id;

-- Re-assert security_invoker so the view keeps honoring the caller's tenant RLS
-- (0048). CREATE OR REPLACE may reset view options; guard on PG15+.
do $$ begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.invoice_totals set (security_invoker = on)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Seed the Receivables/Settlement permission catalog (global reference table;
--    no tenant_id). Enforcement wiring is a later phase; existing module-level
--    ('accounts') access continues to gate the Payments UI as today.
-- ---------------------------------------------------------------------------
insert into public.hr_permissions (key, module, label, description, sort) values
  ('SETTLEMENT_VIEW',        'Receivables', 'View payments & settlements', 'See payments, allocations and settlement status', 150),
  ('SETTLEMENT_CREATE',      'Receivables', 'Record payment / settlement', 'Create payments with multi-invoice allocation', 151),
  ('SETTLEMENT_EDIT',        'Receivables', 'Edit payment / allocation',   'Edit payment details and re-allocate', 152),
  ('SETTLEMENT_CANCEL',      'Receivables', 'Cancel payment',              'Cancel/void a payment record', 153),
  ('DEDUCTION_EDIT',         'Receivables', 'Edit deductions',             'Add or edit TDS/freight/other deductions', 154),
  ('DEDUCTION_RECLASSIFY',   'Receivables', 'Reclassify unknown deduction','Convert an unidentified difference into known deductions', 155),
  ('RECEIVABLES_REPORT_VIEW','Receivables', 'View receivables reports',    'Ageing, settlement, deduction and outstanding reports', 156)
on conflict (key) do update
  set module = excluded.module, label = excluded.label,
      description = excluded.description, sort = excluded.sort;
