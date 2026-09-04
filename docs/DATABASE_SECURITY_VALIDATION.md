# MSM — Database Security Validation

Results are marked PASS only where actually executed. The database migrations were
applied to and verified against the **production** project `cnc-job-order`
(ref `ydhvsiixwmbxoumglpvq`) via the Supabase Management API.

## A. Local gates (executed)

| Gate       | Command             | Result                                         |
| ---------- | ------------------- | ---------------------------------------------- |
| Typecheck  | `npm run typecheck` | ✅ PASS (full tree)                            |
| Unit tests | `npm run test`      | ✅ PASS (48/48)                                |
| Lint       | `npm run lint`      | ✅ PASS (0 errors; pre-existing warnings only) |
| Build      | `npm run build`     | ✅ PASS                                        |

## B. Migration static validation

| Check                                                                         | Result  |
| ----------------------------------------------------------------------------- | ------- |
| Sequential numbering, no collision (committed 0038 preserved; ours 0039–0048) | ✅ PASS |
| No existing migration modified/deleted                                        | ✅ PASS |
| Every schema change in a NEW migration                                        | ✅ PASS |
| Destructive steps guarded by aborting pre-checks (0040, 0043)                 | ✅ PASS |
| SECURITY DEFINER functions pin search_path                                    | ✅ PASS |
| No service-role key in client/repo                                            | ✅ PASS |
| RLS WITH CHECK on tenant policies                                             | ✅ PASS |

## C. Pre-apply safety (executed against production)

| Step                                                                                                                   | Result                |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Read-only baseline captured (AR ₹687,058.40; 81 invoices; GL balance 0)                                                | ✅                    |
| Logical snapshot saved outside repo (`prod_snapshot_pre_multitenant.json`, 322 KB)                                     | ✅                    |
| Supabase daily physical backups (`walg_enabled`)                                                                       | ✅ present (PITR off) |
| **Full dry-run** — all 10 migrations in one `BEGIN…ROLLBACK` against real data; invariants held; **committed nothing** | ✅ PASS               |

## D. Production apply + verification (executed)

| Check                                                                                                     | Result          |
| --------------------------------------------------------------------------------------------------------- | --------------- |
| Migrations 0039–0048 applied per-file (each own transaction)                                              | ✅ PASS (10/10) |
| AR total unchanged (₹687,058.40)                                                                          | ✅ PASS         |
| GL balance = 0                                                                                            | ✅ PASS         |
| `tenant_id` on 80 tenant tables; **0 null / 0 orphan** tenant rows                                        | ✅ PASS         |
| `tenants` seeded (SBI) + memberships backfilled                                                           | ✅ PASS         |
| `tenant_isolation` RLS on 75 tables (+ bespoke on ledger/notifications)                                   | ✅ PASS         |
| Reporting views `security_invoker=on` (no cross-tenant view leak)                                         | ✅ PASS         |
| Live writes during migration auto-stamped tenant (7 payments added by users mid-apply, all tenant-tagged) | ✅ PASS         |
| **Cross-tenant isolation test** (SELECT/INSERT/UPDATE/DELETE across tenants)                              | ✅ PASS         |
| **IDOR** (cross-tenant reference) blocked                                                                 | ✅ PASS         |
| `current_tenant_id()` resolves single membership                                                          | ✅ PASS         |

## E. Not done / follow-on

| Item                                                            | Status                                                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Edge Function `set-active-tenant` deploy (needs `supabase` CLI) | ⏳ code ready, deploy when onboarding tenant #2                                                                            |
| Frontend tenant switcher wiring                                 | ⏳ additive files ready; not required for current single-tenant operation                                                  |
| Frontend redeploy (Vercel)                                      | ⏳ optional — live app already works against the new schema; commit deliberately, separate from concurrent bank-import WIP |
| PITR                                                            | recommend enabling on Supabase for stronger recovery                                                                       |
| Rotate the Supabase access token shared in chat                 | ⚠ recommended now                                                                                                          |

## Summary

Database hardening + multi-tenant isolation is **applied to production and
verified**: data invariants preserved, every business row tenant-stamped, RLS +
view + IDOR isolation proven by an executed cross-tenant test. The live
application continued serving (and correctly tenant-stamping) real writes
throughout. Remaining items are multi-tenant _onboarding_ conveniences, not
current-operation blockers.
