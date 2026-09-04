# MSM — Database Final Review (independent pass)

Reviewer stance: independent senior PostgreSQL/Supabase security engineer, assuming
the implementation is guilty until proven correct. Scope: migrations 0039–0046,
the new RLS/functions/triggers, and their interaction with the pre-existing schema
and the in-flight `0038_bank_import_fixes.sql`.

## Method

Static review against the checklist: tenant escape, RLS bypass, SECURITY DEFINER
abuse, unsafe search_path, over-permissive grants, service-key exposure, IDOR,
cross-company joins, missing WITH CHECK, unsafe views, cascade deletion, race
conditions, duplicate numbering, financial inconsistency, performance regression.
Local gates (typecheck/lint/test/build) were run and pass. **DB-level behaviour
was NOT executed against a live database** — see the gate in the validation doc.

## Findings

### Confirmed-good (no action)

- **search_path:** every new SECURITY DEFINER function pins `set search_path = public`. Consistent with the existing clean baseline. No escalation vector.
- **WITH CHECK present:** the uniform `tenant_isolation` policy sets both `USING` and `WITH CHECK` to `has_tenant_access(tenant_id)`, so tenant_id tampering on INSERT/UPDATE is blocked. Verified in test §2.
- **No recursion:** RLS policies call `has_tenant_access()`, which is SECURITY DEFINER and thus reads `user_tenant_access` without triggering that table's own RLS. No infinite recursion.
- **No service-role key** introduced anywhere; client stays anon-key only.
- **Auto-stamp default** removes the need to touch RPC bodies, shrinking the change surface and the risk of breaking working logic.
- **Ledgers write-only:** journal_lines / tool_transactions / hr_audit_log have read-only tenant policies; writes stay in their DEFINER RPCs.

### HIGH — must fix before onboarding a 2nd tenant (not blocking current single-tenant deploy)

- **H-1 Shared "Unallocated Bank Receipts" customer.** `0038_bank_import_fixes.acc_unallocated_customer()` uses a fixed id `sys_unallocated_receipts` with `on conflict do nothing`. Under multi-tenancy it is stamped to whichever tenant first triggers it; a _second_ tenant's unmatched credit would create a payment referencing another tenant's company → correctly BLOCKED by the 0046 cross-tenant guard, but that means unmatched-credit posting **fails for every tenant except the first**. Fix: make it per-tenant (`id := 'sys_unalloc_' || current_tenant_id()`). Owner of the committed bank-import change (0038) should apply; or a follow-on 0047. _Not editing 0038 here as it is a separate, already-committed change (commit 1a5c4fa)._
- **H-2 No `active_tenant` claim setter.** `current_tenant_id()` honors `app_metadata.active_tenant`, but nothing sets it. Setting `app_metadata` needs the service role (admin API) via an Edge Function. Until built, multi-membership users cannot select an active tenant and `current_tenant_id()` raises for them. **Single-membership users are unaffected** (auto-resolve). Required before multi-tenant go-live.
- **H-3 New-tenant provisioning gap.** A freshly created tenant has no `hr_settings` row; `hr_next_employee_code()` reads it and would fail. Add tenant-create provisioning (seed `hr_settings`, `tenant_settings`, optionally a default COA) before onboarding.

### MEDIUM

- **M-1 hr_notify cross-tenant stamping.** `hr_notify()` stamps the _caller's_ tenant on a notification, not the recipient's. Only wrong if a notification targets a user in another tenant (not a current flow). Revisit when cross-tenant notifications appear.
- **M-2 Legacy `next_seq(text)` requires JWT tenant context.** Any non-request caller (cron/backfill) invoking the 1-arg form will fail (`current_tenant_id()` raises). All current callers are request-scoped. Note for future server jobs.
- **M-3 `contact_messages` left global.** Anon-insert marketing form is not tenant-scoped (single public site). Fine today; revisit if per-tenant marketing sites are added.
- **M-4 Balance-trigger cost.** The deferred per-row constraint trigger recomputes a journal's balance at commit for each touched line. Negligible at shop volume; could add overhead on bulk historical reposts. Acceptable.

### LOW

- **L-1 Unique-constraint names.** 0044 drops global uniques by their conventional `<table>_<column>_key` names. If any were created with a non-default name, the drop is a no-op and both the old global and new tenant-scoped unique would coexist (harmless but redundant). Verify on DEV via `\d <table>` after apply.
- **L-2 `audit_log` tenant stamping** depends on write path; confirm inserts happen in an authenticated context so the default resolves.

## Cascade / race / numbering / financial specifics

- **Cascade:** dangerous cascades are now gated by 0041 delete-guards; draft cleanup still cascades. OK.
- **Race:** doc numbering uses the atomic `doc_counters` upsert (unchanged semantics, now tenant-keyed). Stock/tool advisory locks unchanged. OK.
- **Duplicate numbering:** re-scoped to `(tenant_id, no)`; per-tenant counters prevent cross-tenant collision. OK.
- **Financial:** GL balance now DB-enforced for posted journals; over-allocation still only RPC-enforced on the manual path (bank-import posts advances, which is acceptable) — noted, not newly regressed.

## Verdict

The 0039–0046 set is **safe to apply to the current single-tenant production** and
delivers real tenant isolation at the DB layer. **Full multi-tenant go-live
(onboarding a 2nd business) is blocked on H-1, H-2, H-3** plus the frontend
tenant UX. No CRITICAL issues remain in the migrations themselves. All findings
must be validated on DEV against real data before production (see validation doc).
