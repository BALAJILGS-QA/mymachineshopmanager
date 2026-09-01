# ROUTE_MIGRATION_MAP.md — TanStack Router → Next.js App Router

> Status: **PLAN ONLY — no routes migrated yet.** All rows are `Pending` / `Not verified`.
> Rule: never delete a TanStack route until the Next.js equivalent is built **and** verified (typecheck + relevant Playwright spec green). Preserve every URL, dynamic segment, redirect, and auth boundary.

Legend — **Type:** SSR (public, server-rendered) · CSR (client-only, `/app` `ssr:false`) · Redirect · Layout. **Auth:** Public · Protected · Super-admin.

---

## Public / marketing (server-rendered — migrate first)

| Existing route (file)       | URL                                    | Next.js target                                                         | Type   | Auth   | Status  | Verified |
| --------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | ------ | ------ | ------- | -------- |
| `src/routes/__root.tsx`     | (root layout, head/SEO, catch-all→`/`) | `app/layout.tsx` (+ `not-found.tsx`)                                   | Layout | Public | Pending | ☐        |
| `src/routes/index.tsx`      | `/`                                    | `app/page.tsx` (Landing + login/signup UI merged in)                   | SSR    | Public | Pending | ☐        |
| `src/routes/blog/index.tsx` | `/blog`                                | `app/blog/page.tsx`                                                    | SSR    | Public | Pending | ☐        |
| `src/routes/blog/$slug.tsx` | `/blog/:slug`                          | `app/blog/[slug]/page.tsx` (`generateStaticParams` from `blogData.ts`) | SSR    | Public | Pending | ☐        |

## Compatibility redirects (preserve old URLs)

| Existing route          | URL       | Behaviour                | Next.js target                                                      | Type     | Status  | Verified |
| ----------------------- | --------- | ------------------------ | ------------------------------------------------------------------- | -------- | ------- | -------- |
| `src/routes/login.tsx`  | `/login`  | `redirect('/', replace)` | `app/login/page.tsx` → `redirect('/')` (or `next.config` redirect)  | Redirect | Pending | ☐        |
| `src/routes/signup.tsx` | `/signup` | `redirect('/', replace)` | `app/signup/page.tsx` → `redirect('/')` (or `next.config` redirect) | Redirect | Pending | ☐        |

## Authenticated portal shell (client-only)

| Existing route             | URL scope | Behaviour                                                   | Next.js target                                                                        | Type   | Auth      | Status  | Verified |
| -------------------------- | --------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ | --------- | ------- | -------- |
| `src/routes/app/route.tsx` | `/app/*`  | `ssr:false`; `AppShell`; guard `!session→/`; unknown→`/app` | `app/app/layout.tsx` (`"use client"`, wraps `AppShell` + guard) + `app/app/not-found` | Layout | Protected | Pending | ☐        |

## Authenticated portal pages

| Existing route                            | URL                         | Next.js target                                                | Type | Auth        | Status  | Verified |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------- | ---- | ----------- | ------- | -------- |
| `src/routes/app/index.tsx`                | `/app`                      | `app/app/page.tsx` (Dashboard, **recharts** → client)         | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/jobs.tsx`                 | `/app/jobs`                 | `app/app/jobs/page.tsx`                                       | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/production.tsx`           | `/app/production`           | `app/app/production/page.tsx`                                 | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/materials.tsx`            | `/app/materials`            | `app/app/materials/page.tsx`                                  | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/sales.tsx`                | `/app/sales`                | `app/app/sales/page.tsx`                                      | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/expenses.tsx`             | `/app/expenses`             | `app/app/expenses/page.tsx`                                   | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/deliveries/index.tsx`     | `/app/deliveries`           | `app/app/deliveries/page.tsx`                                 | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/deliveries/$id.print.tsx` | `/app/deliveries/:id/print` | `app/app/deliveries/[id]/print/page.tsx` (**jsPDF** → client) | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/invoices/index.tsx`       | `/app/invoices`             | `app/app/invoices/page.tsx`                                   | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/invoices/$id.print.tsx`   | `/app/invoices/:id/print`   | `app/app/invoices/[id]/print/page.tsx` (**jsPDF** → client)   | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/payments.tsx`             | `/app/payments`             | `app/app/payments/page.tsx`                                   | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/vendors.tsx`              | `/app/vendors`              | `app/app/vendors/page.tsx`                                    | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/subcontracting.tsx`       | `/app/subcontracting`       | `app/app/subcontracting/page.tsx`                             | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/companies.tsx`            | `/app/companies`            | `app/app/companies/page.tsx`                                  | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/approvals.tsx`            | `/app/approvals`            | `app/app/approvals/page.tsx` (super-admin only)               | CSR  | Super-admin | Pending | ☐        |
| `src/routes/app/reports.tsx`              | `/app/reports`              | `app/app/reports/page.tsx` (charts + xlsx export → client)    | CSR  | Protected   | Pending | ☐        |
| `src/routes/app/settings.tsx`             | `/app/settings`             | `app/app/settings/page.tsx`                                   | CSR  | Protected   | Pending | ☐        |

## Module-hub redirects (land on first tab — preserve exactly)

| Existing route                           | URL                        | Redirects to     | Next.js target                                                   | Type     | Status  | Verified |
| ---------------------------------------- | -------------------------- | ---------------- | ---------------------------------------------------------------- | -------- | ------- | -------- |
| `src/routes/app/production-planning.tsx` | `/app/production-planning` | `/app/jobs`      | `app/app/production-planning/page.tsx` → `redirect('/app/jobs')` | Redirect | Pending | ☐        |
| `src/routes/app/accounts.tsx`            | `/app/accounts`            | `/app/expenses`  | `redirect('/app/expenses')`                                      | Redirect | Pending | ☐        |
| `src/routes/app/supply-chain.tsx`        | `/app/supply-chain`        | `/app/vendors`   | `redirect('/app/vendors')`                                       | Redirect | Pending | ☐        |
| `src/routes/app/configuration.tsx`       | `/app/configuration`       | `/app/companies` | `redirect('/app/companies')`                                     | Redirect | Pending | ☐        |

## Catch-alls / not-found

| Existing behaviour        | Source                            | Next.js target                            | Status  | Verified |
| ------------------------- | --------------------------------- | ----------------------------------------- | ------- | -------- |
| Unknown root URL → `/`    | `__root.tsx notFoundComponent`    | `app/not-found.tsx` → redirect `/`        | Pending | ☐        |
| Unknown `/app/*` → `/app` | `app/route.tsx notFoundComponent` | `app/app/not-found.tsx` → redirect `/app` | Pending | ☐        |

---

## Cross-cutting migration notes

- **URL preservation:** every URL above is preserved 1:1. Only the _print_ dynamic segments change file shape (`$id.print.tsx` → `[id]/print/page.tsx`); the public URL (`/app/invoices/:id/print`) is unchanged.
- **No search-param schemas to port:** no `validateSearch` usage found; search/filter/pagination state is component-local (`useState`), so query strings are UI-managed, not route-validated. Keep them working via client state — do not introduce server search params unless intended.
- **Navigation refactors:** `AppShell.tsx` uses TanStack `Link` + `useLocation` + typed `LinkProps['to']` (in `nav.ts`). These become Next `<Link>` + `usePathname()`; `moduleGroupForPath()` logic ports unchanged (pure string matching).
- **Auth guard:** currently client-side in `app/route.tsx`. Reproduce inside the client `app/app/layout.tsx`; optionally add Next middleware later (do not replace the working client gate in the first pass).
- **Verification gate per row:** mark `Verified ☑` only after the Next route renders, the URL/params/redirect match, auth behaves, data loads from the same Supabase backend, and the corresponding Playwright spec (where one exists) passes. Retire the TanStack route only then.
