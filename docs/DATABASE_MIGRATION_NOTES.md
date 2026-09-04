# MSM — Database Migration Notes (0039–0046)

Authoritative change log for the database hardening + multi-tenant program. Read
alongside `DATABASE_AUDIT_REPORT.md` (why) and `MULTI_TENANT_DESIGN.md` (how).

> **Numbering note:** the audit proposed starting at `0030`, but the committed bank-import fix (commit 1a5c4fa) already occupies `0038` (HEAD jumps 0029→0038)
> so this program takes the next free slots, **`0039`–`0046`**. Apply strictly in order.

## Migration inventory

| #    | File                      | Type                                      | Breaking?            | Needs data pre-check  |
| ---- | ------------------------- | ----------------------------------------- | -------------------- | --------------------- |
| 0039 | `perf_indexes.sql`        | additive indexes                          | no                   | no                    |
| 0040 | `integrity_guards.sql`    | constraints + triggers                    | guarded              | **yes — self-aborts** |
| 0041 | `delete_guards.sql`       | before-delete triggers                    | behaviour-preserving | no                    |
| 0042 | `tenant_foundation.sql`   | new tables + functions                    | no                   | no                    |
| 0043 | `tenant_id_add.sql`       | add nullable col + backfill               | no                   | verifies zero nulls   |
| 0044 | `tenant_enforce.sql`      | NOT NULL + default + RLS + uniques        | **yes (isolation)**  | relies on 0043        |
| 0045 | `tenant_numbering.sql`    | numbering + tenant_settings               | no                   | no                    |
| 0046 | `cross_tenant_guards.sql` | reference-guard triggers                  | no                   | no                    |
| 0047 | `tenant_followups.sql`    | per-tenant fixes + provisioning (H-1/H-3) | no                   | no                    |

## What changed & why

### 0039 — perf_indexes (audit H4, L3)

Adds missing FK/filter indexes on invoices, payments, expenses, the three stock
ledgers, delivery_challans, invoice_lines, bank_transactions, subcontracting and
own-material purchases. Drops redundant `idx_issues_reference`. Pure performance;
no behaviour change. Reversible.

### 0040 — integrity_guards (audit C2, M2, M3, M4)

- `journal_lines`: `CHECK (debit = 0 OR credit = 0)`.
- Deferred constraint triggers enforcing **Σdebit = Σcredit** on posted journals
  (checked at commit; drafts exempt; existing history not retro-rejected).
- `bank_transactions`: `CHECK` not both debit & credit > 0.
- Non-negative `CHECK`s on payroll/advances/claims/CTC/salary lines.
- `journals.journal_no`: null-backfill + uniqueness (global here; re-scoped in 0044).
  Every constraint is preceded by a pre-check that **RAISES/aborts** if existing data
  would violate it, so the migration can never corrupt or partially-apply.

### 0041 — delete_guards (audit C3)

BEFORE DELETE triggers that block deletion of **posted/finalized/statutory**
parents (posted journals, finalized payroll periods/runs, bank accounts with
posted/reconciled txns, invoices with generated IRNs, tools with ledger history).
Chosen over FK repointing to RESTRICT specifically because `hr_run_payroll` relies
on the `payroll_records → payroll_runs` cascade to clean up **draft** runs — a
blanket RESTRICT would break re-running payroll. Draft/void/cancelled cleanup is
unaffected.

### 0042 — tenant_foundation (design §2–§3, §6)

New `tenants` and `user_tenant_access` tables; seeds tenant `tnt_sreebalaji`;
backfills every approved user as an active member. Adds access functions
`current_tenant_ids()`, `has_tenant_access()`, `current_tenant_id()`, and
membership RPCs `grant_tenant_access()` / `revoke_tenant_access()`. Re-emits
`set_user_approval()` so approving a user also grants default-tenant membership
(keeps the existing approval UX working). Purely additive — no existing table
touched.

### 0043 — tenant_id_add (design §4)

Adds nullable `tenant_id` to ~80 tenant-owned tables, backfills all rows to
`tnt_sreebalaji`, then **verifies zero nulls and aborts** if any table failed.
Global/reference tables (`hr_permissions/roles/role_permissions`, `gst_tax_rates`,
`hsn_codes`, `contact_messages`, `app_state`, `doc_counters`) intentionally get
no tenant_id.

### 0044 — tenant_enforce (design §5–§6) — the isolation switch

For every tenant table: `DEFAULT current_tenant_id()` (auto-stamp), `NOT NULL`,
`idx_<t>_tenant`, and a single `tenant_isolation` RLS policy
(`using/with check = has_tenant_access(tenant_id)`). Ledger tables
(`journal_lines`, `tool_transactions`, `hr_audit_log`) and `notifications` get
bespoke read/personal policies (writes stay via their SECURITY DEFINER RPCs).
Re-scopes all global business-identifier uniques to `(tenant_id, <id>)`.
**The DEFAULT is the key design decision:** existing RPCs and generic CRUD keep
working unchanged (rows auto-stamp the caller's tenant); no NOT NULL break.

### 0045 — tenant_numbering (design §7–§8)

Tenant-scoped `next_seq`/`peek_seq` (2-arg) with backward-compatible 1-arg
overloads delegating to `current_tenant_id()`; existing `doc_counters` re-keyed
under `tnt_sreebalaji:` so current numbers continue unbroken. Adds
`tenant_settings` (per-tenant settings), seeded from the current `app_state`
settings blob (app keeps reading `app_state` until the settings hook is switched).

### 0046 — cross_tenant_guards (design §9)

BEFORE INSERT/UPDATE triggers asserting a row cannot **reference a parent in a
different tenant** (payment→invoice, journal_line→account/journal, invoice→
company, bank_txn→account/invoice, tool_txn→tool/job, material ledgers, challans).
Closes the IDOR path even for SECURITY DEFINER RPCs (which bypass RLS).

### 0047 — tenant_followups (review H-1, H-3)

Makes onboarding a 2nd tenant safe (not needed for the current single tenant):
per-tenant `acc_unallocated_customer()`; tenant-aware `hr_next_employee_code()`
(was hard-coded to id='singleton'); and `provision_tenant()` to create a tenant

- seed its settings + grant its owner in one call. The `set-active-tenant` Edge
  Function (`supabase/functions/`) + `src/features/tenant/` switcher (H-2) complete
  the multi-membership switch path; deploy the function before enabling switching.

## Backwards compatibility

- `companies` remains the customer master (unchanged meaning + FKs).
- All RPC names/signatures preserved; only additive overloads + auto-stamping.
- Document number formats and values preserved for the existing tenant.
- Single-membership users (the entire current userbase) auto-resolve their tenant,
  so **the frontend keeps working with no code change** after 0039–0046.

## Rollback

Each migration is discrete. 0043 (nullable add) → drop column. 0044 (enforce) →
restore `approved_all` policies + drop NOT NULL/default. 0040/0043 abort on
non-compliant data, so they never partially apply. Keep the pre-migration backup
until production smoke tests pass.

## Required BEFORE onboarding tenant #2 (not needed for current single tenant)

See `DATABASE_FINAL_REVIEW.md` for detail. Summary:

1. Per-tenant `acc_unallocated_customer()` (currently a shared fixed id).
2. `active_tenant` claim setter (Edge Function using service role) + tenant switcher UI.
3. Per-tenant `hr_settings` row provisioning (employee-code sequence) on tenant create.
4. Frontend: sign-up tenant assignment, settings hook → `tenant_settings`, tenant-scoped list filters for multi-membership users.
