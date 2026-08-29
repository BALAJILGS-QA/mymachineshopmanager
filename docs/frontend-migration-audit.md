# Frontend Migration Audit — Vite/React Router → TanStack Start

> Status: **Phase 1 (Audit) complete.** Migration branch: `migrate/tanstack-start`.
> Author: migration engineering. Date: 2026-08-29.

This document is the authoritative pre-migration audit. It records the **actual**
architecture discovered in the repository (not assumptions), the inventories the
master prompt requires, and the risk register that drives the migration plan.

---

## 0. Executive summary

The MSM frontend is a **~15,200 LOC, 89-file, feature-first React 18 + TypeScript
SPA** built with Vite, `react-router-dom` v6, TanStack Query v5, Tailwind, and a
Supabase (PostgreSQL) backend accessed **directly from the client** through a
per-feature `api/` layer wrapped in TanStack Query hooks.

**The single most important finding:** the data layer has _already_ been migrated
to TanStack Query + Supabase. The legacy `localStorage` reactive store
(`src/data/store.ts` + `src/data/db.ts`, read via `useDb`/`useMaybeDb`) is
referenced **only by `store.ts` itself** — no page or component reads from it.
`src/data/demo.ts` and `src/data/db.ts` have no live importers.

**Consequence:** this migration is overwhelmingly a **routing + application-shell**
migration (react-router → TanStack Router, Vite SPA → TanStack Start), **not** a
data-layer rewrite. That sharply reduces risk. The business logic, API contracts,
Supabase RPCs, and TanStack Query wiring are all preserved as-is.

**Recommended SSR strategy:** SSR the public marketing pages (`/`, `/blog`,
`/blog/:slug`) for SEO; render the authenticated portal (`/app/*`) client-side
(route-level `ssr: false` / client-only boundary) because it is a localStorage +
Supabase-session heavy single-user tool with no SEO value.

---

## 1. Existing stack (as discovered)

| Layer             | Technology                                     | Version   | Migration disposition                                     |
| ----------------- | ---------------------------------------------- | --------- | --------------------------------------------------------- |
| Framework/bundler | Vite                                           | ^5.4.11   | **REPLACE** with TanStack Start (Vite-based)              |
| UI runtime        | React + ReactDOM                               | ^18.3.1   | KEEP                                                      |
| Language          | TypeScript (strict)                            | ^5.7.2    | KEEP                                                      |
| Routing           | react-router-dom                               | ^6.28.0   | **REPLACE** with @tanstack/react-router                   |
| Server state      | @tanstack/react-query                          | ^5.62.7   | KEEP                                                      |
| Backend SDK       | @supabase/supabase-js                          | ^2.112.3  | KEEP                                                      |
| Forms             | react-hook-form + @hookform/resolvers + zod    | 7 / 3 / 3 | KEEP                                                      |
| Styling           | Tailwind CSS + PostCSS + autoprefixer          | 3.4       | KEEP                                                      |
| Icons             | lucide-react                                   | ^0.468    | KEEP                                                      |
| Charts            | recharts                                       | ^2.14     | KEEP (client-only)                                        |
| PDF               | jspdf                                          | ^4.2      | KEEP (client-only)                                        |
| Dates             | date-fns                                       | ^4.1      | KEEP                                                      |
| Utils             | clsx                                           | ^2.1      | KEEP                                                      |
| Unit tests        | vitest + @vitest/coverage-v8                   | ^2.1      | KEEP                                                      |
| E2E               | @playwright/test                               | ^1.49     | KEEP (update baseURL/build)                               |
| Lint/format       | eslint 9 (flat) + typescript-eslint + prettier | —         | KEEP (add router plugin config)                           |
| Hosting           | Netlify (static SPA + SPA redirect)            | —         | **REVISIT** (SSR target → Netlify adapter or Node server) |

Path alias: `@/* → src/*` (tsconfig `paths` + Vite `resolve.alias`). Must be
preserved in the TanStack Start Vite config.

---

## 2. Route inventory

Source of truth: `src/App.tsx` (two `<Routes>` trees — public + `/app` portal).
No route uses URL **search params** (`useSearchParams` count = 0), so there is no
query-string state contract to preserve.

| Current Route               | Page component                                    | Auth required | Role/permission        | API dependencies                                               | Migration status                              |
| --------------------------- | ------------------------------------------------- | ------------- | ---------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `/`                         | `LandingPage` (marketing + merged login/register) | No (public)   | —                      | Supabase Auth (login/register)                                 | Planned → `routes/index.tsx` (SSR)            |
| `/blog`                     | `BlogListPage`                                    | No            | —                      | static `blogData.ts`                                           | Planned → `routes/blog/index.tsx` (SSR)       |
| `/blog/:slug`               | `BlogPostPage`                                    | No            | —                      | static `blogData.ts`                                           | Planned → `routes/blog/$slug.tsx` (SSR)       |
| `/login`                    | → redirect to `/`                                 | No            | —                      | —                                                              | Planned → redirect route                      |
| `/signup`                   | → redirect to `/`                                 | No            | —                      | —                                                              | Planned → redirect route                      |
| `/app` (index)              | `DashboardPage`                                   | **Yes**       | any approved user      | jobs, materials, invoices, payments, expenses (TanStack Query) | Planned → `_authenticated/dashboard` (client) |
| `/app/jobs`                 | `JobsPage` (+ `JobForm`)                          | Yes           | any                    | jobs, companies, materials RPC `create_job`/`transition_job`   | Planned (client)                              |
| `/app/production`           | `ProductionPage`                                  | Yes           | any                    | jobs, production_events RPC                                    | Planned (client)                              |
| `/app/materials`            | `MaterialsPage` (+ `MaterialForms`)               | Yes           | any                    | materials, receipts, issues, adjustments                       | Planned (client)                              |
| `/app/deliveries`           | `DeliveriesPage`                                  | Yes           | any                    | delivery_challans, companies, jobs                             | Planned (client)                              |
| `/app/deliveries/:id/print` | `ChallanPrintPage`                                | Yes           | any                    | delivery_challans (+ jspdf)                                    | Planned → `$id/print` (client)                |
| `/app/invoices`             | `InvoicesPage` (+ `InvoiceForm`)                  | Yes           | any                    | invoices, invoice_lines, jobs, companies                       | Planned (client)                              |
| `/app/invoices/:id/print`   | `InvoicePrintPage`                                | Yes           | any                    | invoices (+ jspdf)                                             | Planned → `$id/print` (client)                |
| `/app/payments`             | `PaymentsPage` (+ `PaymentForm`)                  | Yes           | any                    | payments, invoices, companies                                  | Planned (client)                              |
| `/app/expenses`             | `ExpensesPage`                                    | Yes           | any                    | expenses, companies, jobs                                      | Planned (client)                              |
| `/app/reports`              | `ReportsPage`                                     | Yes           | any                    | all collections (read) + xlsx/csv                              | Planned (client)                              |
| `/app/companies`            | `CompaniesPage`                                   | Yes           | any                    | companies                                                      | Planned (client)                              |
| `/app/approvals`            | `ApprovalsPage`                                   | **Yes**       | **SuperAdmin only**    | app_state users, `set_user_approval` RPC                       | Planned (client, role-gated)                  |
| `/app/settings`             | `SettingsPage`                                    | Yes           | any (password/profile) | app_state (settings/sequences)                                 | Planned (client)                              |
| `/app/*` (unknown)          | → redirect to `/app`                              | Yes           | —                      | —                                                              | Planned → not-found → `/app`                  |
| `*` (unknown)               | → redirect to `/`                                 | No            | —                      | —                                                              | Planned → root not-found → `/`                |

**URL preservation contract:** every path above (including the two `/print` deep
links and the `/login`,`/signup` redirects) must resolve identically post-migration.
Full old→new mapping tracked in `docs/frontend-route-migration.md`.

---

## 3. Component inventory

**Layout**

- `components/layout/AppShell.tsx` — sidebar + topbar + mobile bottom-nav; consumes
  `useAuth`, `NavLink`, `useLocation`; renders portal children.
- `components/layout/nav.ts` — `NAV_ITEMS` (12) + `MOBILE_PRIMARY`; `superAdmin` flag
  gates the Approvals item.
- `features/site/SiteLayout.tsx` — public marketing chrome (header/footer, reveal-on-scroll).

**UI primitives** (`components/ui/`)

- `primitives.tsx` (buttons, inputs, labels, cards…), `Modal.tsx` (portal → `document.body`),
  `ConfirmDialog.tsx` (provider + `useConfirm`), `Toast.tsx` (provider + `useToast`),
  `Logo.tsx`.

**Common** (`components/common/`)

- `PageHeader.tsx`, `Filters.tsx`, `Pagination.tsx`, `StatTile.tsx`, `status.tsx` (status badges).

**Forms**

- `JobForm`, `InvoiceForm`, `PaymentForm`, `MaterialForms`, `AuthForm` (login+register),
  plus settings sub-forms. All use react-hook-form + zod. **Validation rules are business
  rules — do not alter.**

**Business/print components**

- `ChallanPrintPage`, `InvoicePrintPage` (print-friendly + `jspdf`), `challanPdf.ts`,
  `invoicePdf.ts` (client-only PDF builders).

**Charts**: `DashboardPage` + `ReportsPage` use `recharts` (client-only).

---

## 4. State inventory

| State kind              | Where                                                         | Mechanism                                                                                                       | Disposition                                                                |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Server state**        | all feature pages                                             | **TanStack Query** (`useQuery`/`useMutation`, keys in `lib/api/queryKeys.ts`) via feature `api/*.ts` → Supabase | KEEP (primary data path)                                                   |
| **Auth/session**        | `features/auth/auth.tsx`                                      | React Context + Supabase Auth session (+ localStorage in local mode)                                            | KEEP; guard for SSR                                                        |
| **UI/client state**     | components                                                    | local `useState`, RHF form state, Toast/Confirm providers                                                       | KEEP                                                                       |
| **URL state**           | routing                                                       | path params only (`:id`, `:slug`); **no search params**                                                         | KEEP via TanStack Router params                                            |
| **Persistent (legacy)** | `data/db.ts` (localStorage `cnc-shop-db`) via `data/store.ts` | `useSyncExternalStore` reactive store                                                                           | **DEAD for reads** — retained only until validated, then removed (Phase 6) |
| **Numbering cache**     | `lib/api/numbering.ts`                                        | module-level cache primed from settings                                                                         | KEEP; SSR-safe (no window) — verify                                        |

---

## 5. API inventory

- **Client**: `src/data/supabase.ts` — single `@supabase/supabase-js` client, created
  at module load **only when both env vars present** (`persistSession`,
  `autoRefreshToken`, `detectSessionInUrl:false`, custom pass-through lock).
- **Access pattern**: per feature `src/features/<f>/api/<f>Api.ts` using helpers in
  `src/lib/api/` (`supabaseCrud.ts` — `selectAll/insertRow/updateRow/deleteRow`,
  `rowMap.ts` — TS↔column maps, `numbering.ts` — document numbers, `errors.ts`,
  `queryKeys.ts`).
- **RPCs (server-side business logic — must not change)**: `create_job`,
  `transition_job` (jobs), `set_user_approval` (approvals). These enforce
  validation, material auto-issue, production events atomically.
- **Tables**: companies, materials, products, job_orders, production_events,
  material_receipts, material_issues, stock_adjustments, delivery_challans,
  invoices, invoice_lines, payments, expenses, audit_log, app_state (singleton:
  settings + sequences + users JSON).
- **Auth headers/cookies**: handled by the Supabase SDK (JWT in localStorage in the
  current SPA). RLS `auth_all` — any authenticated user sees all rows (single-tenant).
- **Error handling**: `lib/api/errors.ts` maps Postgres/`BusinessRuleError`;
  surfaced via Toast. **No REST endpoints of our own** — Supabase is authoritative.
- **Query invalidation**: per-mutation `invalidateQueries` on affected keys
  (e.g. create job invalidates `jobs.all` + `stock.all`).

**Contract to preserve:** table names, columns, RPC signatures, RLS behavior,
query keys, and invalidation semantics are unchanged by this migration.

---

## 6. Authentication inventory

Implemented in `src/features/auth/auth.tsx` (`AuthProvider` + `useAuth`).

- **Two modes**: Supabase mode (env vars present — current prod) and local mode
  (localStorage salted SHA-256 super-admin + registered users in the local store).
- **Roles**: `SuperAdmin` (emails in `SUPER_ADMIN_EMAILS`, currently
  `admin@sreebalajiindustries.com`) and `User`.
- **Approval gate**: new users `signUp` → profile appended to `app_state.data.users`
  with `status:'pending'`; cannot enter `/app` until a super admin approves
  (mirrored server-side by `set_user_approval` for RLS). `pending`/`rejected` are
  signed out with a message.
- **Session persistence**: Supabase SDK (`persistSession:true`) / localStorage
  `cnc-shop-session` in local mode.
- **Login/logout/changePassword**: all in the `AuthApi`. Logout calls
  `supabase.auth.signOut()` (or clears localStorage).
- **Protected routes**: `App.tsx` `Portal` gates `/app/*` on `session` + (Supabase)
  store hydration; unauthenticated → `<Navigate to="/">`.
- **User-perspective behaviors that must remain identical**: login, logout, session
  persistence + expiry, unauthorized redirect, role-based visibility (Approvals),
  approval pending/rejected messaging, password change.

**Migration approach:** keep `AuthProvider`/`useAuth` intact; move the gate + hydrate
logic into a TanStack Router `_authenticated` layout `beforeLoad`/component. Auth
stays client-side (no server session cookie introduced) to avoid changing behavior.

---

## 7. Risk inventory

| #   | Risk                                                                                                                                                                      | Severity | Mitigation                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **SSR module-load crashes**: `main.tsx` calls `ensureDb()` (localStorage) at import; `data/supabase.ts` creates client at import; auth uses `crypto.subtle`, localStorage | High     | Keep these off the SSR path: portal routes are client-only; move `ensureDb()` out of module scope; guard browser APIs behind `typeof window`/`onMount`. |
| R2  | **Hydration mismatch**: `Date`, generated ids (`uid`), `Math.random`, reveal-on-scroll, Modal portal to `document.body`                                                   | High     | Render dynamic/auth UI client-only; ensure public SSR pages are deterministic; `useReveal`/portals run in effects only.                                 |
| R3  | **Netlify hosting model change** (static SPA → SSR)                                                                                                                       | Med      | Choose Netlify SSR adapter or Node server target; keep SPA redirect fallback for client routes; document in migration-notes.                            |
| R4  | **Router API behavioral differences** (relative nav, splat redirects, `Navigate` replace)                                                                                 | Med      | Port file-by-file (13 files); keep exact redirect semantics; add e2e for deep links + redirects.                                                        |
| R5  | **Legacy dead code removal too early** (`store`, `db`, `demo`, `backend`) still imported by `App.tsx`/`main.tsx`/`auth`                                                   | Med      | Remove ONLY after portal migrated + validated; auth local-mode `userRepo` + `BusinessRuleError` stay.                                                   |
| R6  | **Env var boundary** (`import.meta.env.VITE_*` client-only) under Start server context                                                                                    | Med      | Continue using `VITE_` public vars only; never move secrets server-side; validate in `lib/env.ts`.                                                      |
| R7  | **Print/PDF pages** (`jspdf`, `window.print`) under SSR                                                                                                                   | Low      | Client-only routes; guard `window`.                                                                                                                     |
| R8  | **E2E/base URL + build command drift**                                                                                                                                    | Low      | Update `playwright.config.ts` webServer + `netlify.toml` build; re-run full suite in Phase 6.                                                           |
| R9  | **Test-before-delete discipline**                                                                                                                                         | Low      | Enforced via Phase-6 checklist; keep old entry recoverable on branch until green.                                                                       |

---

## 8. Migration principles (binding)

1. Preserve every `/app/...` and public URL exactly. 2. No business-rule, API, RPC,
   schema, or UI-design changes. 3. Server state stays in TanStack Query. 4. Keep the
   Supabase client + auth behavior identical from the user's perspective. 5. Migrate
   incrementally; typecheck + lint + build + e2e after each module. 6. Remove legacy
   code only after the replacement is validated. 7. Backend remains the security
   authority; client permissions are UX only.

See companion docs: `frontend-route-migration.md`, `frontend-feature-parity.md`,
`frontend-architecture.md`, `frontend-migration-notes.md`.
