# MSM — Database Audit Report (Phase 1)

**Scope:** `docs/supabase-schema.sql`, `docs/supabase-*.sql`, all `supabase/migrations/0001‥0029`, and the frontend Supabase/auth/RPC layer.
**Method:** Source-of-truth read of every SQL object + frontend tenant/auth handling, with `file:line` evidence. No schema was modified. This is a read-only audit.
**Status:** Phase 1 complete. Phases that change schema or deploy are **gated** pending decisions in §14.

---

## 0. The single finding that reframes this project

> **MSM is a genuinely single-tenant system. `companies` is the CUSTOMER master, not a tenant. There is ZERO tenant isolation in the database today — not one RLS policy filters by `company_id`.**

Evidence:

- `companies` = customers/material-owners: `CompaniesPage.tsx:114` ("Customers and material owners"), `:237` ("Customer Code"); the `Company` type has no user/owner link (`types/index.ts:27-38`).
- No tenant concept exists anywhere: grep for `tenant_id|tenant|org_id|workspace|business_entity` across `src/` and `app/` finds only a CSS comment and one stray comment in `0020_hrm_core.sql:12`.
- Every RLS policy uses exactly one of: `using(true)`, `using(is_app_approved())`, or (pre-0026/0027) HR-permission predicates. **None reference `company_id` in USING/WITH CHECK.** Migrations **0026** (finance) and **0027** (HRM) explicitly _removed_ the only policies that consulted company scope, collapsing everything to `is_app_approved()`.
- `company_id` on every business row is the **user-chosen customer**, passed from the client form (`invoicesApi.ts:64`, `jobsApi.ts:36`, `paymentsApi.ts:24`) — never derived from the authenticated user.

**Consequence:** the authorization model is "any _approved_ authenticated user is a full-org superuser over all data." That is _coherent and safe for a single shop_ (the current reality: one business, Sree Balaji Industries). It is **not** multi-tenant, and it cannot be made multi-tenant by patching RLS alone — it requires a new tenant entity, a user→tenant mapping, a NOT-NULL tenant key on ~80 tables, tenant-scoped RLS on every table, tenant-scoped RPCs, tenant-scoped document numbering, and a data-migration of all existing rows to the Sree Balaji tenant. See §14 for why this is a decision gate, not an autonomous action.

---

## 1. Severity summary

| Sev          | #   | Headline findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CRITICAL** | 3   | (C1) No tenant isolation — every approved user can read/write all companies' data. (C2) `journal_lines` has no `debit=0 OR credit=0` check and no DB-level balance enforcement — unbalanced GL entries are possible via direct writes. (C3) Dangerous `ON DELETE CASCADE` FKs can erase _posted_ financial/payroll history.                                                                                                                                                         |
| **HIGH**     | 4   | (H1) Global unique doc numbers + single global `doc_counters` → collide the moment a 2nd tenant exists. (H2) Payments have no DB-level over-allocation guard; bank-import paths bypass the RPC guard entirely. (H3) RBAC flattened — 0026/0027 made every approved user able to post journals, finalize payroll, read employee PII/bank data regardless of role. (H4) Missing FK/filter indexes on money + stock ledgers (invoices, payments, expenses, all 3 stock-ledger tables). |
| **MEDIUM**   | 5   | (M1) `app_state` is world-readable/writable to _any_ authenticated user (even not-yet-approved) — exposes all user profiles + settings. (M2) Payroll/advance/claim monetary columns lack non-negative CHECKs. (M3) `journals.journal_no` nullable + no unique constraint. (M4) `bank_transactions` permits both/neither of debit/credit nonzero. (M5) No single-payment-to-many-invoices allocation model (single `payments.invoice_id`).                                           |
| **LOW**      | 3   | (L1) anon can INSERT `contact_messages` (spam, no DB rate limit). (L2) anon `register_pending_user` can append pending rows to `app_state.data.users` (spam/unbounded JSON, visible to all authed users). (L3) Redundant index `idx_issues_reference` (prefix of a later unique index).                                                                                                                                                                                             |
| **INFO**     | 3   | (I1) All 30 `SECURITY DEFINER` functions correctly pin `search_path` — clean. (I2) No service-role key anywhere in the repo — client uses anon key only — clean. (I3) Core financial FKs default to NO ACTION, which _protects_ history from casual deletes — good.                                                                                                                                                                                                                 |

---

## 2. Phase A — Multi-tenant isolation matrix

"Tenant Field" below is `company_id` **only in the customer sense**; it is _not_ a tenant key and _no RLS policy filters on it_. Therefore, under the current model, cross-company access is unrestricted for every approved user. "Safe" = isolated between companies.

| Table                                                                                     | Tenant/company field | Nullable        | RLS policy                           | SELECT safe | INSERT safe | UPDATE safe | DELETE safe | Risk                     |
| ----------------------------------------------------------------------------------------- | -------------------- | --------------- | ------------------------------------ | ----------- | ----------- | ----------- | ----------- | ------------------------ |
| companies                                                                                 | (is the customer)    | —               | approved_all                         | ❌          | ❌          | ❌          | ❌          | CRITICAL                 |
| job_orders                                                                                | company_id           | no              | approved_all                         | ❌          | ❌          | ❌          | ❌          | HIGH                     |
| invoices                                                                                  | company_id           | no              | approved_all                         | ❌          | ❌          | ❌          | ❌          | CRITICAL                 |
| invoice_lines                                                                             | (via invoice)        | —               | approved_all                         | ❌          | ❌          | ❌          | ❌          | CRITICAL                 |
| payments                                                                                  | company_id           | no              | approved_all                         | ❌          | ❌          | ❌          | ❌          | CRITICAL                 |
| expenses                                                                                  | company_id           | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | HIGH                     |
| material_receipts / issues / stock_adjustments                                            | company_id           | yes (null=shop) | approved_all                         | ❌          | ❌          | ❌          | ❌          | HIGH                     |
| stock_transfers                                                                           | company_id           | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | MEDIUM                   |
| delivery_challans                                                                         | company_id           | no              | approved_all                         | ❌          | ❌          | ❌          | ❌          | HIGH                     |
| vendors / subcontract_orders / subcontract_docs                                           | company_id (sc only) | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | MEDIUM                   |
| chart_of_accounts / fiscal_years / accounting_periods                                     | company_id           | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | CRITICAL                 |
| journals / journal_lines                                                                  | company_id (hdr)     | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | CRITICAL                 |
| bank_accounts / bank_transactions / bank_statement_files / bank_txn_rules / party_aliases | company_id           | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | CRITICAL                 |
| gst_registrations / gst_return_periods / einvoice_records / eway_bills                    | company_id           | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | HIGH                     |
| employees                                                                                 | company_id           | yes             | approved_all (post-0027)             | ❌          | ❌          | ❌          | ❌          | CRITICAL (PII, bank a/c) |
| payroll_periods / runs / records, salary_* , employee_salary                              | company_id           | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | CRITICAL                 |
| leave_* / attendance / shifts / departments / designations / holidays                     | company_id           | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | HIGH                     |
| employee_documents / assets / advances / claims / recruitment / performance / training    | company_id           | yes             | approved_all                         | ❌          | ❌          | ❌          | ❌          | HIGH                     |
| tools / tool_transactions / reservations / maintenance / calibrations                     | (none)               | —               | approved_all                         | ❌          | ❌          | ❌          | ❌          | MEDIUM                   |
| tool_transactions                                                                         | (none)               | —               | read-only; write via `tool_move`     | ❌          | n/a         | n/a         | n/a         | MEDIUM                   |
| contact_messages                                                                          | (none)               | —               | anon INSERT; authed R/U/D            | n/a         | ⚠ anon      | ❌          | ❌          | LOW                      |
| app_state                                                                                 | (none)               | —               | `using(true)` authed                 | ❌          | ❌          | ❌          | ❌          | MEDIUM                   |
| approved_users                                                                            | (none)               | —               | RLS on, **no policy** (definer-only) | ✅          | ✅          | ✅          | ✅          | INFO (correct)           |
| doc_counters                                                                              | (none)               | —               | RLS on, **no policy** (definer-only) | ✅          | ✅          | ✅          | ✅          | INFO (correct)           |

_Every "❌" is expected and acceptable for the current single-shop deployment; every "❌" becomes an active cross-tenant breach the instant a second tenant's data lands in these tables._

---

## 3. Phase 6 — SECURITY DEFINER RPC audit

- **30/30 `SECURITY DEFINER` functions pin `search_path`** (`set search_path = public` / `= 'public'`). No privilege-escalation vector via search_path. Full table verified: `is_super_admin`, `is_app_approved`, `set_user_approval`, `next_seq`, `peek_seq`, `register_pending_user`, all `hr_*`, `acc_system`, `acc_period_for`, `post_journal`, `void_journal`, `detect_bank_duplicates`, `post_bank_txn`, `post_bank_txn_split`, `tool_can`, `tool_move`. **CLEAN.**
- Rule-bearing stock/job/invoice/challan RPCs (`create_*`, `update_*`, `transition_*`, `material_balance`, `receipt_available`, `assert_source_dispatchable`) are `SECURITY INVOKER` — RLS still applies to them. Correct.
- **Gap (ties to C1/H3):** no `SECURITY DEFINER` function validates that the caller _owns_ the `company_id`/`invoice_id`/`payment_id`/`employee_id` it is handed. Because there is no tenant model, they cannot — they trust the approved caller. Under multi-tenancy, each of these becomes an IDOR/cross-tenant write path and must add an ownership check against the caller's tenant.
- **EXECUTE grants:** all to `authenticated` except `register_pending_user` → `anon, authenticated` (hardened: forces `status='pending'`, cannot approve, returns void). Acceptable.

---

## 4. Phase 7 — View security

7 views: `material_stock`, `material_receipt_stock`, `inventory_ledger`, `invoice_totals`, `general_ledger`, `trial_balance`, `tool_inventory`. All are plain (non-`security_barrier`, non-materialized) views that run with the querying user's privileges over RLS'd base tables. Today they inherit `is_app_approved()` — i.e. **no tenant filter**. Under multi-tenancy they must either become `security_invoker=on` views (PG15+) so the caller's tenant RLS applies, or embed a tenant predicate. No view currently leaks _beyond_ what the base-table RLS allows, so no new exposure over §2 — but they are on the multi-tenant remediation list.

---

## 5. Phase 8 — Financial data integrity

- **C2 — GL balance not enforced at DB level.** `journal_lines` has only `debit>=0`, `credit>=0` (`0022:135-136`). No `check(debit=0 OR credit=0)`; Σdebit=Σcredit is enforced _only_ inside `post_journal` (`0022:279-281`). Direct inserts (writers hold RLS) can create malformed/unbalanced entries.
- **H2 — Payment over-allocation.** `amount ≤ outstanding` guard exists only in `create_payment` (`0004:75-77`). `post_bank_txn` (`0023:267`) and `post_bank_txn_split` (`0025:74`) insert payments directly, bypassing it. No table constraint caps Σpayments at invoice total.
- **M4 — `bank_transactions`** permits both `debit_amount` and `credit_amount` zero or both nonzero (`0023:59-60`).
- **Good:** invoice/qty/amount CHECKs are broadly present; posted invoices are cancelled via `set_invoice_status` (soft) not deleted; `payments.invoice_id → invoices` is NO ACTION so a paid invoice can't be raw-deleted. Locked accounting periods are rejected by `post_journal`/`acc_period_for`.

## 6. Phase 9 — Payment allocation

**Single-invoice model only:** one payment → at most one invoice via the scalar `payments.invoice_id` (`schema.sql:208`). No `payment_allocations` table. `invoice_totals.paid = Σ amount where invoice_id=i.id`. A payment cannot be split across invoices; advances use `is_advance`/null invoice. If split-allocation is a requirement, a new `payment_allocations` table + view rework is needed (non-destructive, additive).

## 7. Phase 11 — Foreign key audit (dangerous cascades → C3)

Most FKs default to **NO ACTION** (protective). The dangerous explicit cascades that can erase posted history:

| Child → Parent                                   | File:line   | Risk                                                               |
| ------------------------------------------------ | ----------- | ------------------------------------------------------------------ |
| `journal_lines → journals` CASCADE               | 0022:133    | raw `DELETE journals` erases GL lines                              |
| `payroll_records → payroll_runs` CASCADE         | 0021:103    | deletes finalized payslip snapshots                                |
| `payroll_records/runs → payroll_periods` CASCADE | 0021:104/87 | deleting a period nukes runs+records (no finalized/locked guard)   |
| `bank_transactions → bank_accounts` CASCADE      | 0023:51     | deletes reconciled txn ledger; dangles posted_* links              |
| `einvoice_records → invoices` CASCADE            | 0024:95     | deletes statutory IRN artifacts                                    |
| `tool_transactions → tools` CASCADE              | 0028:119    | deletes the sole source of tool stock truth                        |
| `invoice_lines → invoices` CASCADE               | schema:192  | Draft/Unpaid invoice hard-delete erases lines (mitigated for paid) |

Remediation: repoint to `RESTRICT` + soft-void, via a new migration (needs verification that no current code relies on the cascade).

## 8. Phase 10 — Constraint audit

- Global uniques on all core doc numbers (`invoice_no`, `payment_no`, `dc_no`, `receipt_no`, `issue_no`, `adj_no`, `job_no`, company/material/product/vendor `code`) → **H1 collision risk** under multi-tenancy. Newer modules (HRM/Accounts/GST) already scope uniques by `coalesce(company_id,'*')` — the pattern to follow.
- `journals.journal_no` nullable + **no unique** (`0022:110`) → M3.
- Missing non-negative CHECKs on payroll/advance/claim/CTC/salary-line monetary columns → M2.
- Present CHECKs on qty/amount/discount/tax are good.

## 9. Phase 12/13 — Index & reporting performance

**Likely-missing (FK/filter columns actually queried):**

- `invoices(company_id)`, `invoices(status)`, `invoices(date)` — AR lists/aging.
- `payments(company_id)` — customer ledger (only `invoice_id` indexed).
- `expenses(company_id)`, `expenses(job_id)`.
- `material_id` on **all three** stock ledgers (drives `material_balance`, `material_stock` view) — high value.
- `delivery_challans(job_id)`, `delivery_challans(invoice_id)`; `bank_transactions(matched_invoice_id)`; `invoice_lines(job_id)`, `invoice_lines(material_id)`; various subcontract/own-purchase FKs.

All additive (`create index if not exists`, ideally `concurrently`) — non-breaking. **Redundant:** `idx_issues_reference` (prefix of `uq_issue_reference_material_source`) — L3.

**Reporting views** (`trial_balance`, `general_ledger`, `invoice_totals`, `inventory_ledger`) aggregate transaction tables live. Fine at current volume; revisit with materialized views only when profiling justifies (Phase 13 says don't prematurely denormalize).

## 10. Phase 14 — Document numbering

`doc_counters` + `next_seq()` is a single **global** counter set, concurrency-safe (row upsert). No tenant/FY/series dimension. Consistent with today's global uniques. Multi-tenant + FY-series numbering (`INV/26-27/00001`) requires keying the counter by `(tenant, doc_type, fy, series)` and scoping the uniques — backwards-compatible if existing numbers are preserved and only new series adopt the format.

## 11. Phase 15 — Audit logging

Two trails: legacy `audit_log` (core) and rich `hr_audit_log` (actor/before/after/meta, write-only via `hr_log`). Finance/bank/tool RPCs call `hr_log`. Gaps: core sales/stock RPCs write `audit_log` inconsistently; no single standardized envelope across modules. Recommendation (non-breaking): standardize on the `hr_audit_log` shape (actor, tenant, module, entity, entity_id, action, old/new, meta) and route all critical events through one `SECURITY DEFINER` logger; keep it user-uneditable (already the case).

## 12. Phase 16 — JSONB audit

Appropriate JSONB: `app_state.data`, `hr_settings.data`, audit `before/after/meta`, `payroll_records.earnings/deductions` (snapshots), `delivery_challans.lines`, GST `payload/items/summary`, `employees.statutory`. **Watch item:** `delivery_challans.lines` (jsonb) is queried/edited as line data — acceptable given the dispatch RPCs, but it's relational data in JSON; not urgent. No JSONB migration recommended without confirming app dependencies.

## 13. Phase 17 — Data migration safety (readiness)

Any tenant migration must: snapshot counts + financial totals + stock balances + payroll totals **before**; assign all existing rows to a `sree-balaji` tenant; verify zero orphans; add NOT NULL/constraints **only after** backfill; re-verify totals **after**. A verification script (counts + `sum()` invariants) is required and is part of the gated implementation, not this audit.

---

## 14. Decision gate — why I am stopping here before changing schema

Per Phase 0 ("never blindly modify", "every change via a new migration", "never deploy until gates pass") and the standing rule _"If a potentially breaking change is discovered, DO NOT implement it immediately — document the risk and confirm"_, the following cannot proceed autonomously:

1. **Multi-tenancy is a product decision, not a bug fix.** The system is deliberately single-tenant with live production data for one business. Introducing tenants rewrites the ownership model of ~80 tables, every RLS policy, most RPCs, numbering, and requires a data migration. Doing this uninstructed risks the #1 priority (data safety). **I need to confirm the actual goal** (see questions).
2. **Deployment to DEV/MAIN/production Supabase + Vercel is irreversible and outward-facing.** It needs verified environment access (connection to a DEV project, prod backup confirmation) and explicit authorization. I will not push migrations to a live database without it. The prompt's DEV→MAIN→prod cross-tenant security tests also _require a live multi-tenant DB that does not yet exist_.
3. **Several "fixes" can conflict with existing prod data** (e.g. a new `debit=0 OR credit=0` CHECK, non-negative CHECKs, cascade repointing). These must be validated against a real snapshot first.

**What is safe to do next without any gate** (additive, non-breaking, reversible): a new migration `0030` adding the missing indexes (`create index if not exists ... concurrently`) and dropping the redundant one. That alone addresses H4/L3 with zero behavioral risk.

**What is gated on your answers:** the multi-tenant re-architecture (C1/H1/H3), the integrity CHECKs + cascade repointing (C2/C3/M2/M4 — need prod-data validation), payment-allocation table (M5), numbering redesign, and all deployment phases (26–32).

---

## 15. Proposed sequencing (once scope is confirmed)

1. **Non-breaking hardening (0030):** missing indexes, redundant-index cleanup, non-negative CHECKs _guarded by a pre-check that existing data complies_, `journals.journal_no` unique+backfill. Deploy DEV→verify→prod.
2. **Integrity guards (0031):** `journal_lines` debit/credit XOR check + optional balance trigger; bank txn direction check; cascade→RESTRICT repointing with soft-delete paths. Requires data validation.
3. **Multi-tenant foundation (0032+)** _(only if confirmed):_ `tenants` + `user_tenant_access` tables; `current_tenant_id()` helper; add `tenant_id` (nullable) everywhere; backfill to Sree Balaji; flip to NOT NULL; tenant-scoped RLS with `WITH CHECK`; tenant-scoped uniques + numbering; RPC ownership checks; security test suite.
4. **Deployment** per Phases 26–32 with before/after invariant verification, against verified environments.

---

_Phase 1 audit complete. Findings above are evidence-backed against the current source. No schema was modified. Awaiting decisions in §14 before proceeding to schema changes or deployment._
