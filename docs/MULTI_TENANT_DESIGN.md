# MSM — Multi-Tenant Architecture Design

**Status:** Approved direction (full multi-tenant re-architecture). This document is the blueprint that migrations `0042+` and the frontend tenant work implement. Read it before touching those.
**Principle:** additive, staged, backwards-compatible. Existing Sree Balaji data is preserved and assigned to a first tenant; nothing is dropped or rewritten in place.

---

## 1. Vocabulary (do not conflate these)

| Term                         | Meaning in MSM                                                                                                 | Table                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Tenant / business entity** | An independent business using MSM. Owns its own customers, invoices, stock, books, employees. **This is new.** | `tenants` (new)                                        |
| **Customer**                 | A counterparty the shop invoices / owns material for. Already exists — **unchanged in meaning.**               | `companies` (existing)                                 |
| **User**                     | A Supabase Auth identity (email).                                                                              | `auth.users` (Supabase) + profile in `app_state` today |
| **Membership**               | Which tenants a user may access, and their role there. **This is new.**                                        | `user_tenant_access` (new)                             |

> Critical: `companies` stays the **customer** master. We do **not** rename it or repurpose it as the tenant. Every existing `company_id` FK keeps meaning "customer". The new isolation axis is `tenant_id`, added alongside.

Target shape:

```
tenants (Business Entity A) ── user_tenant_access ──> users
   │
   └── everything with tenant_id = A:  companies(customers), invoices, payments,
       jobs, stock, accounting, banking, GST, HRM, tool room …   (isolated from B)
```

---

## 2. New core tables

### 2.1 `tenants`

```sql
create table public.tenants (
  id          text primary key,              -- e.g. 'tnt_sreebalaji'
  code        text not null unique,          -- short slug, e.g. 'SBI'
  name        text not null,
  legal_name  text,
  gstin       text,
  status      text not null default 'active' check (status in ('active','suspended','closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

Seed one row for the current live business:

```sql
insert into public.tenants (id, code, name, legal_name)
values ('tnt_sreebalaji','SBI','Sree Balaji Industries','Sree Balaji Industries')
on conflict (id) do nothing;
```

### 2.2 `user_tenant_access`

```sql
create table public.user_tenant_access (
  id          text primary key,
  email       text not null,                 -- matches auth.jwt() ->> 'email' (lowercased)
  tenant_id   text not null references public.tenants(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member','viewer')),
  status      text not null default 'active' check (status in ('active','pending','suspended')),
  created_at  timestamptz not null default now(),
  created_by  text
);
create unique index uq_uta_email_tenant on public.user_tenant_access (lower(email), tenant_id);
create index idx_uta_email on public.user_tenant_access (lower(email));
```

RLS: readable by the user themselves + super admins; writable only via `SECURITY DEFINER` functions (`grant_tenant_access` / `revoke_tenant_access`), so a user can never self-grant access to another tenant.

Backfill: every currently-approved user becomes an `active` member of the Sree Balaji tenant:

```sql
insert into public.user_tenant_access (id, email, tenant_id, role, status, created_by)
select 'uta_' || md5(lower(a.email)), lower(a.email), 'tnt_sreebalaji',
       case when a.role ilike '%admin%' then 'admin' else 'member' end, 'active', 'backfill'
from public.approved_users a
on conflict (lower(email), tenant_id) do nothing;
```

---

## 3. Access-decision functions (all `SECURITY DEFINER`, `search_path` pinned)

The system already proves the safe pattern (`is_app_approved`). Add tenant-aware equivalents:

```sql
-- Set of tenant ids the caller may access (super admin ⇒ all tenants).
create or replace function public.current_tenant_ids()
returns setof text language sql stable security definer set search_path = public as $$
  select id from public.tenants where public.is_super_admin()
  union
  select tenant_id from public.user_tenant_access
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) and status = 'active';
$$;

-- Row-level guard used by every RLS policy.
create or replace function public.has_tenant_access(p_tenant_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.user_tenant_access
                 where tenant_id = p_tenant_id
                   and lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
                   and status = 'active');
$$;

-- The tenant to STAMP on new rows, chosen server-side (never from the client).
-- Reads an "active tenant" claim if present; else the caller's sole membership.
create or replace function public.current_tenant_id()
returns text language plpgsql stable security definer set search_path = public as $$
declare v text; n int;
begin
  v := nullif(auth.jwt() -> 'app_metadata' ->> 'active_tenant', '');
  if v is not null and public.has_tenant_access(v) then return v; end if;
  select count(*) into n from public.current_tenant_ids();
  if n = 1 then return (select * from public.current_tenant_ids()); end if;
  raise exception 'No active tenant selected (user has % memberships)', n;
end $$;
```

**Isolation model:** RLS grants a user access to **every tenant they are an active member of** (`has_tenant_access(tenant_id)`). Between two _different_ businesses this is airtight — a user of tenant B has no membership row for tenant A, so `has_tenant_access('A')` is false for them. For a user who legitimately belongs to _multiple_ tenants, the app pins an **active tenant** and filters queries to it; `current_tenant_id()` (used by write RPCs) honors the `app_metadata.active_tenant` claim so new rows are stamped correctly. For the common single-tenant user, no claim is needed.

---

## 4. `tenant_id` rollout across the schema

### 4.1 Tenant-owned tables (get `tenant_id text not null references tenants(id)`)

All business tables. Grouped:

- **Sales/AR:** companies, job_orders, production_events, invoices, invoice_lines, payments, delivery_challans, expenses
- **Inventory:** materials, material_receipts, material_issues, stock_adjustments, stock_transfers, own_material_purchases
- **Purchasing:** vendors, subcontract_orders, subcontract_docs
- **Accounting:** chart_of_accounts, fiscal_years, accounting_periods, journals, journal_lines, bank_accounts
- **Banking:** bank_statement_files, bank_transactions, bank_txn_rules, party_aliases
- **GST:** gst_registrations, gst_return_periods, einvoice_records, eway_bills
- **HRM:** departments, designations, employees, employee_status_history, shifts, shift_assignments, holidays, leave_types, leave_balances, leave_applications, attendance, salary_components, salary_structures, salary_structure_lines, employee_salary, payroll_periods, payroll_runs, payroll_records, document_types, employee_documents, employee_assets, asset_assignments, employee_advances, advance_repayments, expense_categories, expense_claims, job_openings, candidates, interview_rounds, job_offers, performance_cycles, performance_reviews, performance_goals, training_programs, training_sessions, employee_training
- **Tool Room:** tool_categories, tools, tool_transactions, tool_reservations, tool_maintenance, tool_calibrations
- **Platform (per-tenant):** notifications, hr_audit_log, audit_log, hr_user_roles, hr_settings

> Child tables (invoice_lines, journal_lines, production_events, subcontract_docs, payroll_records, tool_transactions, …) also carry `tenant_id` directly (denormalized from parent) so RLS is a simple column check and never needs a join. The create-RPCs stamp it from the parent.

### 4.2 Global / reference tables (NO `tenant_id`)

- `hr_permissions`, `hr_roles`, `hr_role_permissions` — the RBAC **catalog** (definitions) is global; only _assignments_ (`hr_user_roles`) are per-tenant.
- `gst_tax_rates`, `hsn_codes` — statutory reference data, shared.
- `tenants`, `user_tenant_access`, `approved_users` (deprecated post-migration), `doc_counters` (tenant enters via the key), `app_state` (see §7).

### 4.3 Rollout sequence per table (zero-downtime, safe)

1. `alter table X add column tenant_id text references tenants(id);` (nullable)
2. `update X set tenant_id = 'tnt_sreebalaji' where tenant_id is null;` (backfill)
3. verify zero nulls: `select count(*) from X where tenant_id is null;` → must be 0
4. `alter table X alter column tenant_id set not null;`
5. `create index idx_X_tenant on X (tenant_id);` (and composite `(tenant_id, <hot filter>)`)
6. swap RLS to tenant isolation (§5)
7. re-scope unique constraints (§6)

Steps 1–3 ship in migration `0043`; steps 4–7 in `0044`, so a backfill failure never leaves a NOT NULL column half-populated.

---

## 5. RLS — tenant isolation (replaces `approved_all`)

Uniform policy on every tenant-owned table:

```sql
alter table public.X enable row level security;
drop policy if exists approved_all on public.X;
drop policy if exists tenant_isolation on public.X;
create policy tenant_isolation on public.X for all to authenticated
  using (public.has_tenant_access(tenant_id))
  with check (public.has_tenant_access(tenant_id));
```

- `USING` filters reads/updates/deletes to the caller's tenants.
- `WITH CHECK` blocks INSERT/UPDATE that set `tenant_id` to a tenant the caller doesn't belong to — closes the "tamper tenant_id" attack.
- Ledger tables written only via `SECURITY DEFINER` RPCs (`journal_lines`, `tool_transactions`) keep a **read-only** tenant-isolation policy; writes go through the RPC which stamps `tenant_id`.
- `hr_audit_log` stays read-scoped-to-tenant, write-only via `hr_log`.

Membership/approval collapse into one concept: an active `user_tenant_access` row **is** approval for that tenant. `is_app_approved()` is kept during migration for compatibility, then the policies stop referencing it once every table is tenant-scoped.

**Views** (`invoice_totals`, `trial_balance`, `general_ledger`, `material_stock`, `material_receipt_stock`, `inventory_ledger`, `tool_inventory`): recreate as `security_invoker = on` (PG15+) so the caller's tenant RLS on the base tables applies transparently — no view rewrite needed beyond the flag.

---

## 6. Uniqueness re-scoping (fixes H1 collision)

Every currently-global business identifier becomes unique **per tenant**:

```sql
alter table public.invoices drop constraint invoices_invoice_no_key;
create unique index uq_invoices_tenant_no on public.invoices (tenant_id, invoice_no);
```

Apply the same to: companies.code, materials.code, products.code, vendors.code, job_orders.job_no, invoices.invoice_no, payments.payment_no, material_receipts.receipt_no, material_issues.issue_no, stock_adjustments.adj_no, expenses.expense_no, delivery_challans.dc_no, subcontract_orders.sc_no, tools.code. (HRM/Accounts/GST already scope by `coalesce(company_id,'*')`; those become `(tenant_id, company_id, code)`.) Existing single-tenant data satisfies the new constraints unchanged.

---

## 7. `app_state` split (settings & sequences go per-tenant)

`app_state` (singleton) currently holds `data.settings`, `data.sequences`, `data.users`. Under multi-tenancy:

- **users** → superseded by `user_tenant_access` (identity/membership) + Supabase auth. Keep the JSON list read-only during migration, then retire.
- **sequences** → already migrated to `doc_counters`; make tenant-scoped (§8).
- **settings** → must become **per-tenant**. Introduce `tenant_settings (tenant_id pk, data jsonb, updated_at)` and migrate the current singleton's settings to the Sree Balaji row. The frontend settings hook reads/writes the active tenant's row.

This is the largest frontend-visible change and is staged separately (`0045` + settings hook update) so the app keeps working on the singleton until switched over.

---

## 8. Document numbering (tenant + optional FY/series)

`doc_counters.key` becomes tenant-scoped; `next_seq` gains a tenant arg with a backward-compatible overload:

```sql
-- new: tenant-scoped
create or replace function public.next_seq(p_tenant_id text, p_key text) returns bigint ...
  -- counter key stored as  p_tenant_id || ':' || p_key   (optionally || ':' || fy || ':' || series)
-- kept: legacy 1-arg delegates to current_tenant_id()
create or replace function public.next_seq(p_key text) returns bigint
  language sql ... select public.next_seq(public.current_tenant_id(), p_key);
```

Existing counters are re-keyed to `tnt_sreebalaji:<key>` in the migration so current numbers continue unbroken. FY-series format (`INV/26-27/00001`) is opt-in per tenant via `tenant_settings`; default keeps the current plain running number.

---

## 9. RPC hardening (fixes IDOR / cross-tenant writes)

Every write RPC changes in two ways:

1. **Stamp, don't trust:** set `tenant_id := current_tenant_id()` server-side. Never accept `tenant_id` from the client.
2. **Validate parents belong to the caller's tenant:** before linking, assert the referenced row is in-tenant. Examples:
   - `create_payment(p_invoice_id, …)` → `if not exists(select 1 from invoices where id=p_invoice_id and has_tenant_access(tenant_id)) then raise exception`.
   - `create_invoice(p_company_id, p_lines[*].job_id/material_id, …)` → all referenced customer/job/material must be in-tenant.
   - `post_journal(p_lines[*].account_id)` → accounts in-tenant; period in-tenant.
   - `post_bank_txn(p_txn_id, p_invoice_id)` → txn and invoice in-tenant.
   - `tool_move(p_tool_id, p_job_id)` → tool/job in-tenant.
   - HR: `hr_apply_leave`, `hr_run_payroll`, etc. scope to employees in-tenant.

Because these RPCs are `SECURITY DEFINER`/`INVOKER` and RLS also enforces `has_tenant_access`, this is defense-in-depth: RLS blocks the row even if a check is missed, and the explicit check gives a clean error.

---

## 10. Frontend changes (`src/`, `app/`)

1. **Auth (`auth.tsx`):** after sign-in, load `user_tenant_access` for the email. If exactly one active tenant → set it active. If several → prompt/select. If none → "no access / pending" state. Store `activeTenantId` in context.
2. **Active-tenant claim:** on tenant switch, set `app_metadata.active_tenant` (via an Edge Function / admin RPC) so `current_tenant_id()` stamps correctly, OR pass no tenant and rely on single-membership. Document the chosen path in the migration notes.
3. **Tenant switcher UI:** header dropdown when membership > 1; invalidates all React Query caches on switch.
4. **Queries:** continue calling Supabase-direct; RLS enforces isolation. Lists additionally filter by `activeTenantId` for multi-membership users. No `tenant_id` is ever sent on writes — the RPC stamps it.
5. **Sign-up:** `register_pending_user` also creates a `pending` `user_tenant_access` row for the target tenant (or a "request access" flow); super admin approves → status `active`.
6. **Settings hook:** read/write `tenant_settings` for the active tenant instead of the `app_state` singleton.
7. **Super admin console:** manage tenants + memberships.

No `next/link` / `next/navigation` in `src/features/**` (existing rule) — tenant switcher uses the `AppLink`/`useAppNavigate` bridge.

---

## 11. Data migration & verification

Order of operations for production:

1. **Backup** (Supabase PITR / manual dump) — confirmed before anything.
2. Apply `0039` (indexes) — already safe.
3. Apply `0040` (integrity guards) + `0041` (cascade repointing) — each self-aborts if existing data violates a new rule (pre-check `raise exception`), so they cannot corrupt data.
4. Apply `0042` (tenants + memberships + backfill).
5. Apply `0043` (add nullable tenant_id + backfill). **Verify zero nulls.**
6. Apply `0044` (NOT NULL + tenant RLS + uniques).
7. Apply `0045` (tenant numbering + settings split).
8. Apply `0046` (RPC hardening).

**Verification script** (`supabase/verify_migration.sql`, run before + after; values must match except where intentionally changed):

```sql
-- record counts
select 'invoices' t, count(*) from invoices union all select 'payments', count(*) from payments ...;
-- financial invariants
select sum(subtotal), sum(total), sum(paid), sum(outstanding) from invoice_totals;
select sum(debit)-sum(credit) as gl_imbalance from journal_lines
  join journals using (id?) where status='posted';   -- must be 0
-- stock balances
select material_id, balance from material_stock order by material_id;
-- payroll totals
select sum(net_total) from payroll_runs;
-- orphans (must all be 0)
select count(*) from invoices where tenant_id is null;
select count(*) from job_orders j left join tenants t on t.id=j.tenant_id where t.id is null;
```

**Rollback:** each stage is a discrete migration. `0043` (nullable add) is reversible by dropping the column. `0044` (NOT NULL + policy swap) rollback = restore `approved_all` policy + drop NOT NULL. Keep the pre-migration backup until production smoke tests pass. Because `0040/0041` abort on non-compliant data, they never partially apply.

---

## 12. What stays exactly the same

- `companies` = customers (meaning, columns, existing FKs).
- All existing RPC names/signatures (extended, not replaced; legacy overloads kept).
- Document number formats for the existing tenant (counters re-keyed, values preserved).
- The approval concept (now expressed as tenant membership).
- All business logic in `computations.ts`, dispatch/allocation rules, double-entry posting.

This design adds an isolation axis; it does not rewrite the ERP.
