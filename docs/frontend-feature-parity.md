# Frontend Feature Parity Checklist

Post-migration status. **Migrated** = code carried onto TanStack Start (all feature
pages/forms/components are unchanged; only routing + shell moved). **Tested** in Phase 6.

Legend: ✅ done · ⚠️ page **renders** under e2e (`portal-nav.spec`); deep CRUD/print/
export click-through still recommended · ❌ missing (must be zero)

> Update: every portal page now **renders** under Playwright e2e (`portal-nav.spec`
> visits all 12 `/app` routes; `supabase.spec` does a full Companies create/delete
> round-trip). ⚠️ below means only the deeper per-page CRUD/print/export flows are not
> yet scripted — the page itself is confirmed rendering behind the migrated router+gate.

> Result: **0 features removed.** Every feature page, form, table, dialog, PDF/CSV path,
> and business-rule guard is byte-for-byte the same module as before — the migration
> only replaced `react-router-dom` + Vite entry with TanStack Start/Router. `data/
computations.ts` (all calculations), the Supabase RPCs, TanStack Query hooks, and
> auth logic are untouched.

## Core modules

| Module                                                          | Migrated | Tested                            |
| --------------------------------------------------------------- | -------- | --------------------------------- |
| Auth (login/register/approval/logout/change-pw/session)         | ✅       | ✅ e2e login + browser            |
| Dashboard (KPIs, charts, priority jobs, low-stock, recent)      | ✅       | ✅ e2e (shell) / ⚠️ visual        |
| Companies (CRUD, code/GSTIN, delete-guard)                      | ✅       | ✅ e2e (create/delete round-trip) |
| Job Orders (create/edit, `create_job` RPC, auto-issue)          | ✅       | ⚠️                                |
| Production (transitions via `transition_job`, history)          | ✅       | ⚠️                                |
| Inventory / Materials (master, receipts, issues, adj, balances) | ✅       | ⚠️                                |
| Delivery Challans (CRUD, print+PDF, invoiced-guard)             | ✅       | ⚠️ (print route probed 200)       |
| Invoices (build/manual, CGST/SGST, print+PDF)                   | ✅       | ⚠️ (print route probed 200)       |
| Payments (full/partial/advance, outstanding recalc)             | ✅       | ⚠️                                |
| Expenses (categorised, company/job allocation)                  | ✅       | ⚠️                                |
| Reports (7 reports, filters, CSV/XLSX)                          | ✅       | ⚠️                                |
| Settings (masters, numbering, profile, tax, backup, password)   | ✅       | ⚠️                                |
| Approvals (SuperAdmin gate, approve/reject, RLS mirror)         | ✅       | ⚠️                                |
| Public site (landing + merged auth, blog list/post, SEO)        | ✅       | ✅ e2e                            |

## Cross-cutting UI/UX

| Concern                                              | Migrated | Tested                              |
| ---------------------------------------------------- | -------- | ----------------------------------- |
| Sidebar / topbar / mobile bottom-nav (active states) | ✅       | ✅ browser (landing) / ⚠️ portal    |
| Toast notifications                                  | ✅       | ⚠️                                  |
| Confirm dialogs                                      | ✅       | ✅ e2e (delete confirm)             |
| Modals (portal)                                      | ✅       | ⚠️                                  |
| Loading / empty / error states                       | ✅       | ⚠️                                  |
| Pagination / filtering / sorting / search            | ✅       | ⚠️                                  |
| Responsive (desktop/laptop/tablet/mobile)            | ✅       | ⚠️ (mobile e2e project available)   |
| Print pages (challan, invoice)                       | ✅       | ⚠️ (routes probed)                  |
| CSV / XLSX export, PDF export                        | ✅       | ⚠️                                  |
| Currency/number/date formatting                      | ✅       | ✅ e2e (Companies values)           |
| SEO (title, meta, canonical, OG, JSON-LD per route)  | ✅       | ✅ e2e (`route-jsonld`, blog title) |

## Business-rule guards (unchanged — enforced by Supabase RPCs/constraints + `computations.ts`)

Unique job/invoice/receipt/payment/DC numbers · companies with transactions can't be
deleted (inactivate) · stock never silently negative · invoice totals + outstanding
system-calculated · positive payment amounts · completed qty ≤ ordered (unless
overproduction) · cancelled financial docs kept · configurable INR currency. **None of
these were touched by the migration.**

## Remaining sign-off

The ⚠️ rows are thin route wrappers around unchanged feature pages behind the same
e2e-verified auth gate. Recommended final step before production: a manual click-through
of each portal page (create/edit/print/export) — ideally scripted as additional
Playwright specs seeded with fresh data (the earlier data wipe removed the fixtures the
old `dashboard.spec` relied on).
