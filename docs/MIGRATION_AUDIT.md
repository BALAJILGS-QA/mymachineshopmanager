# MSM — Migration Audit (Phase 1)

> **Status:** Phase 1 (Audit only). No business functionality has been changed.
> **Date:** 2026-08-26
> **Scope:** Full-codebase audit grounded in the actual source, database schema,
> and running app. This document is the baseline inventory that all later
> migration phases refer back to. Nothing here should be refactored until this
> audit is reviewed and the phased plan is approved.

---

## 0. Executive summary

MSM is a **single-page React 18 + TypeScript app** for CNC/VMC machine-shop
management (job orders, materials/stock, delivery challans, invoices, payments,
expenses, reports). It is a **local-first application with an optional Supabase
write-through backend**. There is **no custom server**: all business rules live
in a client-side repository layer (`src/data/repo.ts`), and Supabase/Postgres is
used purely for persistence + auth.

The defining architectural fact — and the crux of the whole migration — is the
**data layer**:

```
UI (features/*)
  ├── read  ──► useDb(selector)  ─► in-memory Database (one JSON doc)
  └── write ──► repo.*()  ─► mutate()  ─► saveDb()  ─► localStorage
                                              └─► persistHook = syncThrough()
                                                      └─► Supabase (full-state diff upsert/delete)
```

The **entire dataset lives in one JSON document** in `localStorage`, mirrored to
`useSyncExternalStore`. Supabase mode **hydrates the whole DB on login**
(`SELECT *` from every table) and **writes through by diffing the whole state on
every change**. TanStack Query is installed and a `QueryClientProvider` is
mounted, but **it is not used for any data** — no `useQuery`/`useMutation` exist.

This model is elegant for a single-user shop but is fundamentally at odds with
the SaaS / multi-tenant / API-driven target. The migration is therefore a
**data-layer re-platforming**, not a cosmetic upgrade.

**Typecheck baseline:** `npm run lint` (which is `tsc --noEmit`) passes clean
(exit 0). Production build config is `tsc -b && vite build`.

---

## 1. Current architecture

| Concern                 | Current implementation                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **UI**                  | React 18.3, TypeScript (strict), functional components + hooks                                                                   |
| **Build**               | Vite 5.4, `@` → `src` alias, manual Rollup chunks (react / charts / vendor)                                                      |
| **Styling**             | Tailwind 3.4, custom `brand` green palette, hand-written `.card/.btn/.input/.label` in `src/index.css`; icons via `lucide-react` |
| **Routing**             | React Router v6 (`BrowserRouter`), public routes + `/app/*` portal                                                               |
| **State (server data)** | Custom synchronous store: `src/data/db.ts` (localStorage JSON) + `src/data/store.ts` (`useSyncExternalStore`)                    |
| **State (client/UI)**   | Local `useState`; context providers for Toast, Confirm, Auth                                                                     |
| **Business logic**      | `src/data/repo.ts` (~925 lines) — the single mutation path; `src/data/computations.ts` — pure derivations                        |
| **Backend**             | Supabase (Postgres + Auth), optional. Adapter: `src/data/backend.ts`                                                             |
| **Auth**                | Dual-mode: Supabase Auth **or** local SHA-256 credential; approval-gated                                                         |
| **PDF**                 | jsPDF, in dedicated modules (`invoicePdf.ts`, `challanPdf.ts`)                                                                   |
| **Charts**              | Recharts (Dashboard only)                                                                                                        |
| **Forms**               | Manual `useState`; **no** react-hook-form / Zod at the form boundary                                                             |
| **Tests**               | Playwright E2E only (`e2e/*.spec.ts`); **no** unit/Vitest tests                                                                  |
| **Lint/format**         | **None** — no ESLint, Prettier, Husky, or lint-staged configured                                                                 |
| **Hosting**             | Netlify static SPA (`netlify.toml`), deploy via `scripts/deploy.mjs`                                                             |
| **Package manager**     | npm (`package-lock.json` present)                                                                                                |

### Source tree (src/, ~57 files)

```
src/
  main.tsx                 App bootstrap: QueryClientProvider + BrowserRouter + Auth/Toast/Confirm providers
  App.tsx                  Route table (public + /app/* portal, auth+hydration gate)
  index.css                Tailwind layers + brand components + print styles
  data/
    db.ts                  Low-level localStorage JSON store + mutate()/subscribe()
    store.ts               useSyncExternalStore binding (useDb/useMaybeDb) + hydrateFromRemote()
    repo.ts                Repository/service layer — ALL business rules
    computations.ts        Pure derivations (invoice totals, stock balance, valuation)
    supabase.ts            Supabase client (created only if env vars present)
    backend.ts             Supabase adapter: loadAll() hydrate + syncThrough() write-through diff
    seed.ts / demo.ts      Initial settings + demo dataset
  types/index.ts           Domain model (single source of truth)
  features/
    auth/          auth.tsx (AuthProvider/useAuth), AuthForm.tsx
    dashboard/     DashboardPage.tsx
    jobs/          JobsPage.tsx, JobForm.tsx
    production/    ProductionPage.tsx
    materials/     MaterialsPage.tsx, MaterialForms.tsx (material/receipt/issue/adjustment)
    deliveries/    DeliveriesPage.tsx, ChallanPrintPage.tsx, challanPdf.ts
    invoices/      InvoicesPage.tsx, InvoiceForm.tsx, InvoicePrintPage.tsx, invoicePdf.ts
    payments/      PaymentsPage.tsx, PaymentForm.tsx
    expenses/      ExpensesPage.tsx
    reports/       ReportsPage.tsx
    companies/     CompaniesPage.tsx
    approvals/     ApprovalsPage.tsx  (super-admin: approve/reject sign-ups)
    settings/      SettingsPage.tsx
    shared/        lookups.ts (useCompanyName/useMaterialName/useJobNo)
    site/          LandingPage, BlogListPage, BlogPostPage, SiteLayout, blogData, useReveal
  components/
    layout/        AppShell.tsx, nav.ts
    common/        PageHeader.tsx (+ ResponsiveTable), Pagination.tsx, Filters.tsx, status.tsx
    ui/            Modal.tsx, Toast.tsx, ConfirmDialog.tsx, primitives.tsx, Logo.tsx
  lib/             format.ts, id.ts, csv.ts, brand.ts, seo.ts
```

---

## 2. Current dependencies

**Runtime:** react 18.3, react-dom 18.3, react-router-dom 6.28,
@tanstack/react-query 5.62 _(mounted but unused for data)_, @supabase/supabase-js
2.112, jspdf 4.2, recharts 2.14, date-fns 4.1, lucide-react 0.468, clsx 2.1,
react-hook-form 7.54 _(unused)_, @hookform/resolvers 3.9 _(unused)_, zod 3.24
_(not used at form boundaries)_.

**Dev:** vite 5.4, @vitejs/plugin-react 4.3, typescript 5.7, tailwindcss 3.4,
postcss 8.4, autoprefixer 10.4, @playwright/test 1.49, @types/*.

**Notable gaps vs. target:** no ESLint, Prettier, Husky, lint-staged, Vitest,
Zustand, shadcn/ui, Radix, @tanstack/react-table, Motion, Sentry.

**Effectively-unused today:** `@tanstack/react-query`, `react-hook-form`,
`@hookform/resolvers`, `zod` (installed, imported almost nowhere for their
intended purpose). These become _used_ under the target, so do **not** remove
them.

---

## 3. Current routes

Defined in `src/App.tsx` (flat, no lazy-loading, no route-level RBAC).

**Public:**

- `/` → `LandingPage` (marketing + inline sign-in/sign-up)
- `/blog`, `/blog/:slug` → blog
- `/login`, `/signup` → redirect to `/`
- `*` → redirect to `/`

**Portal (`/app/*`, gated by `Portal` on auth + Supabase hydration):**

- `/app` (index) → Dashboard
- `/app/jobs`, `/app/production`, `/app/materials`
- `/app/deliveries`, `/app/deliveries/:id/print`
- `/app/invoices`, `/app/invoices/:id/print`
- `/app/payments`, `/app/expenses`, `/app/reports`
- `/app/companies`, `/app/approvals`, `/app/settings`
- `/app/*` → redirect to `/app`

**Gaps:** no dedicated `/login`/`/unauthorized`/`404` pages; no per-route role
guard (any authenticated+approved user reaches every page); no error boundary;
no code-splitting.

---

## 4. Current modules (business features)

| Module                        | Read                             | Write (repo)         | Notes                                                                                                 |
| ----------------------------- | -------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| Companies (customers/vendors) | `db.companies`                   | `companyRepo`        | code auto `C###`; delete blocked if referenced                                                        |
| Materials (master)            | `db.materials`                   | `materialRepo`       | code auto `M###`; delete blocked if referenced                                                        |
| Products (rate list)          | `db.products`                    | `productRepo`        | code auto `P###`; used for machining rates                                                            |
| Job orders                    | `db.jobs`                        | `jobRepo`            | auto job no.; **auto-issues material** on create; status transitions record `ProductionEvent`         |
| Production                    | `db.productionEvents`            | `jobRepo.transition` | Pending→In Progress→Completed→Delivered (+On Hold/Cancelled); records rejected qty (QC) at completion |
| Stock (receipt/issue/adjust)  | `db.receipts/issues/adjustments` | `stockRepo`          | **own (shop) vs customer stock kept separate** via `companyId` scope; negative-stock guard            |
| Delivery challans             | `db.deliveryChallans`            | `dcRepo`             | lines as JSONB; Open→Invoiced→Cancelled; reopen guarded                                               |
| Invoices                      | `db.invoices`                    | `invoiceRepo`        | CGST/SGST split; editable invoice no.; cancel frees linked DC                                         |
| Payments                      | `db.payments`                    | `paymentRepo`        | allocation vs invoice; advance payments; recomputes invoice status                                    |
| Expenses                      | `db.expenses`                    | `expenseRepo`        | category + method; optional job/company link                                                          |
| Reports                       | derived                          | —                    | 7 tabular reports + CSV export                                                                        |
| Settings                      | `db.settings`                    | `settingsRepo`       | currency, tax defaults, units, categories, numbering patterns, shop profile                           |
| Users / Approvals             | `db.users`                       | `userRepo`           | registration → pending → super-admin approve/reject                                                   |
| Audit log                     | `db.auditLog`                    | `audit()`            | every create/update/delete/status; capped at 1000 rows client-side                                    |

**QC** and **machines** from the target's feature list are **not** discrete
modules today: QC exists only as `rejectedQty` recorded on job completion; there
is **no machine entity** at all. (Flagged under §16 — do not invent.)

---

## 5. Current database structure

Schema in `docs/supabase-schema.sql` (+ incremental patches
`supabase-invoice-columns.sql`, `supabase-job-rejected-qty.sql`,
`supabase-approval-policy.sql`). **String (TEXT) primary keys** generated
client-side (e.g. `cmp_ab12cd`), not UUIDs.

**Tables:** `app_state` (singleton JSON: settings + sequences + users),
`companies`, `materials`, `products`, `job_orders`, `production_events`,
`material_receipts`, `material_issues`, `stock_adjustments`, `delivery_challans`
(lines JSONB), `invoices`, `invoice_lines`, `payments`, `expenses`, `audit_log`.
Plus (in approval policy) `approved_users`.

**Enums:** `job_status`, `job_priority`, `invoice_status`, `payment_method`,
`owner_type`.

**Views:** `material_stock` (receipts − issues + adjustments per material),
`invoice_totals` (subtotal/tax/total/paid/outstanding, Cancelled excluded).

**Keys/constraints:** FKs on all references; `unique` on all document numbers
and master codes; `check` constraints (qty > 0, rate ≥ 0, signed adjustment ≠ 0,
etc.). Indexes: `idx_jobs_company`, `idx_jobs_status`, `idx_prod_job`,
`idx_lines_invoice`, `idx_pay_invoice`, `idx_dc_company`.

**Notable structural characteristics:**

- `delivery_challans.lines` and `app_state.data` are JSONB — the challan line
  items and the whole settings/sequences/users blob are **not relational**.
- **Document numbering sequences live in `app_state.data.sequences`** (client
  increments them), _not_ Postgres sequences.
- **No `organization_id` anywhere** → strictly single-tenant.
- `material_stock` / `invoice_totals` views compute **overall** balances; the
  own-vs-customer stock split (`SHOP_SCOPE`) exists only in the **TS**
  `computations.ts`, not in the SQL view.

---

## 6. Current authentication

`src/features/auth/auth.tsx` — context provider, dual backend:

- **Supabase mode** (env vars present, which is the case now): email/password via
  Supabase Auth. Session persisted/refreshed by supabase-js. A custom
  **pass-through auth lock** replaces the Web Locks API to avoid cross-reload
  deadlocks. User profiles + approval status are stored in
  `app_state.data.users` (JSON) — **no `profiles` table**.
- **Local mode** (no env vars): a salted **SHA-256** super-admin credential in
  `localStorage`; registered users (with `passwordHash`) live in the local store.

**Flow:** new sign-ups create a `pending` user and are signed out; they cannot
enter until a **super admin** approves. Super admin is any email in the
hardcoded `SUPER_ADMIN_EMAILS = ['admin@sreebalajiindustries.com']`
(`auth.tsx:68`), mirrored in the SQL `is_super_admin()` function.

**Session gate** (`App.tsx` `Portal`): `loading` → spinner; no session →
redirect to `/`; Supabase mode → `hydrateFromRemote()` before rendering.

---

## 7. Current authorization

- **Two effective roles only:** `SuperAdmin` and `User` (`UserRole` in types).
  There is **no granular RBAC** — an approved `User` can reach and mutate every
  module. `isSuperAdmin` only gates the Approvals page.
- **RLS (base schema):** every table `enable row level security` + a permissive
  `auth_all` policy `for all to authenticated using (true) with check (true)`.
  i.e. **any authenticated user = full access**.
- **RLS (approval policy, `supabase-approval-policy.sql`):** tightens business
  tables to `using (public.is_app_approved())`. Approval is stored in
  `approved_users` (RLS-enabled, **no policies** → only `SECURITY DEFINER`
  functions can touch it). `set_user_approval(email, approved)` RPC only acts for
  a super admin. This is a genuine, well-designed **hard security boundary** —
  _provided the policy file has actually been applied to the live project_
  (needs verification, see §17).
- **`app_state` is intentionally left open** to all authenticated users (sign-up
  writes pending profile; login reads status). Consequence: any authenticated
  user can rewrite settings/sequences/**the entire users list** — see §11.

---

## 8. Current state management

- **Server/business data:** single `Database` object → `localStorage` →
  `useSyncExternalStore`. `mutate(fn)` runs the mutation then **shallow-copies
  all 15 collections** into a new object so identity-based memoization
  recomputes; `saveDb` re-`JSON.stringify`s the whole DB and calls the persist
  hook. A monotonic `revision` integer drives re-renders.
- **Supabase sync:** `syncThrough(next)` deep-clones the whole DB
  (`JSON.parse(JSON.stringify)`) and **diffs every collection by id** against the
  last synced snapshot, upserting parents-first and deleting children-first.
  Serialized through a promise queue; **last-write-wins, no conflict handling**.
- **Client/UI state:** ad-hoc `useState` per page; three React contexts (Auth,
  Toast, Confirm). **No Zustand.**
- **TanStack Query:** provider mounted in `main.tsx` (`staleTime: 30s`,
  `refetchOnWindowFocus: false`) but **zero** `useQuery`/`useMutation`.

---

## 9. Current API / service architecture

- **Repository pattern already exists** and is disciplined: the UI never calls
  Supabase directly; it reads via `useDb` selectors and writes via `*Repo`
  functions. Grep confirms **no** `supabase.from(...)` in any feature component
  (Supabase is confined to `data/supabase.ts`, `data/backend.ts`, and
  `auth.tsx`). This is a **strong starting point** for the target's
  UI → hook → service → backend layering.
- **But** the repo is synchronous and mutates an in-memory doc; it is **not** an
  async API client. There are no per-entity `getX/createX` service modules, no
  query keys, no pagination/filtering at the data layer (all client-side).
- PDF modules and computations also read via `getDb()` directly (acceptable, but
  couples them to the in-memory store).

---

## 10. Current technical debt

1. **Whole-DB-in-localStorage** is the root constraint: unbounded memory, full
   re-serialize per write, full re-hydrate per login, last-write-wins sync.
2. **TanStack Query mounted but unused** — misleading; real fetching is the
   custom store.
3. **Forms are hand-rolled `useState`** with imperative validation duplicated
   from repo rules; `react-hook-form`/`zod` present but unused.
4. **Enum/label duplication:** statuses, priorities, payment methods, categories
   are re-declared in feature files _and_ in `types/index.ts` _and_ in the SQL
   enums (3 copies, manually kept in sync).
5. **`SUPER_ADMIN_EMAILS` duplicated** in `auth.tsx` and the SQL function — must
   be edited in two places.
6. **`emptyDb()` / initial sequences object duplicated** in `backend.ts` (twice)
   and `seed.ts`.
7. **No lint/format tooling** → style consistency relies on discipline only.
8. **No error boundaries**, no centralized logger (raw `console.error` in store
   and sync paths).
9. **Plain `<table>` everywhere** with a shared client-side `usePagination`; no
   column model, sorting is per-page ad hoc.
10. **Client-side document numbering** in `app_state.sequences` is a correctness
    risk the moment more than one client writes concurrently.

---

## 11. Security issues

| #   | Severity | Issue                                                                                                                                                                                                                                                                                                   | Location                              |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| S1  | 🔴 High  | **Default super-admin credentials `superadmin` / `superadmin123`** hard-coded, and **shown in the sign-in UI hint** (local mode).                                                                                                                                                                       | `auth.tsx:64-65`, `AuthForm.tsx`      |
| S2  | 🔴 High  | **`app_state` world-writable by any authenticated user** → the entire `users` list (profiles + approval status) and settings/sequences can be tampered. It can't bypass the `approved_users` RLS gate for _business data_, but it can corrupt settings/numbering and spoof the frontend approval check. | `supabase-approval-policy.sql:95-97`  |
| S3  | 🟠 Med   | **Approval RLS policy may not be applied** to the live project — base schema ships the permissive `auth_all` (any authenticated = full access). Must verify which policy is live.                                                                                                                       | schema vs. policy file                |
| S4  | 🟠 Med   | **Full business dataset cached in `localStorage` in plaintext** — data-at-rest exposure on shared/kiosk machines; persists after logout (only session key is cleared).                                                                                                                                  | `db.ts`, `auth.tsx logout()`          |
| S5  | 🟠 Med   | **Two-place super-admin list** invites drift between app and DB, risking privilege mismatch.                                                                                                                                                                                                            | `auth.tsx:68`, SQL `is_super_admin()` |
| S6  | 🟡 Low   | Local-mode passwords use **single-static-salt SHA-256** (no per-user salt, no KDF) — weak if local storage is read. (Supabase mode is fine.)                                                                                                                                                            | `auth.tsx sha256()`                   |
| S7  | 🟡 Low   | No route-level authorization — approved users can reach every module (defense-in-depth gap, mostly UX today).                                                                                                                                                                                           | `App.tsx`                             |
| S8  | 🟢 Info  | Good: security headers set in `netlify.toml` (X-Frame-Options DENY, nosniff, Referrer-Policy). No unsafe raw-HTML render sink found. Anon key correctly the only key in the frontend.                                                                                                                   |

**Credentials handed over this session (Supabase `sbp_`, GitHub `ghp_`, Netlify
`nfp_`) were pasted in plaintext chat and should be rotated after the
engagement.** The Supabase anon key is public by design.

---

## 12. Performance issues

| #   | Issue                                                                                                                               | Impact                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P1  | `loadAll()` runs `SELECT *` on **every table** at login (no columns/filters/pagination).                                            | Login cost grows linearly with total data; unbounded.       |
| P2  | Whole dataset held in memory; **all filtering, pagination, aggregation client-side** (dashboard, reports iterate full collections). | Fine < ~10k rows; degrades and inflates memory beyond that. |
| P3  | `mutate()` shallow-copies **all 15 collections** and `saveDb` re-`JSON.stringify`s the whole DB **on every single write**.          | O(total rows) per keystroke-level mutation.                 |
| P4  | `syncThrough()` deep-clones the entire DB **twice** and diffs every collection **per write**.                                       | O(total rows) network+CPU per change.                       |
| P5  | No route-level code splitting / lazy loading; charts + jspdf in the main graph (partially mitigated by manual chunks).              | Larger initial bundle than necessary.                       |
| P6  | `audit_log` fetched in full (capped at 1000 client-side, but the table itself is unbounded server-side).                            | Grows without server-side retention.                        |

---

## 13. Hardcoded values (to centralize — without over-engineering)

- **Credentials/roles:** `superadmin`/`superadmin123` (`auth.tsx:64-65`);
  `SUPER_ADMIN_EMAILS` (`auth.tsx:68` + SQL).
- **Enums duplicated in UI:** job priorities & statuses (`JobForm.tsx`), payment
  methods (`PaymentForm.tsx`), invoice statuses (`InvoicesPage.tsx`), DC status
  tone map (`DeliveriesPage.tsx`).
- **Config:** pagination sizes `[25,50,100]` default 25 (`Pagination.tsx`); toast
  auto-dismiss 4000ms (`Toast.tsx`); dashboard window "last 6 months"
  (`DashboardPage.tsx`); default CGST/SGST = `defaultTaxPercent/2`
  (`InvoiceForm.tsx`); currency symbol `₹` / `Rs.` fallback (`invoicePdf.ts`).
- **Seed:** four seed companies in SQL (`supabase-schema.sql:321`).

> Note: statuses/priorities/methods are _already_ centralized as TS union types
> in `types/index.ts` and as SQL enums — the debt is the **re-declared string
> arrays in feature files**, which should derive from a single constants source.

---

## 14. Duplicate code

- Initial `sequences` / `emptyDb()` object: `backend.ts` (×2) and `seed.ts`.
- Enum string arrays: feature files vs. `types` vs. SQL enums (×3).
- `SUPER_ADMIN_EMAILS`: `auth.tsx` vs. SQL.
- Deep-merge of settings defaults: `store.ensureDb()` and `backend.loadAll()`.
- Column↔field mapping maintained by hand in `backend.ts` (mirrors `types`).

---

## 15. Missing validation

- **No schema validation at any form boundary.** All forms (Job, Invoice,
  Payment, Material×4, Auth, Company, Expense, DC, Settings) use manual `useState`
  - imperative checks. Validation _rules_ do exist — centralized in `repo.ts` as
    `BusinessRuleError` throws — but they run only on submit inside the repo, and
    are duplicated informally in some forms.
- `zod` + `@hookform/resolvers` are installed but not wired.
- Consequence for the target: schemas must be authored (ideally shared
  client+server) and RHF wired; the repo's existing rules are the **spec** for
  those schemas — do not re-invent them.

---

## 16. Missing tests

- **No unit/integration tests, no Vitest.** The pure, high-value logic in
  `computations.ts` (tax, outstanding, stock balance, valuation) and the rules in
  `repo.ts` are entirely untested at unit level.
- **E2E (Playwright) exists** and is reasonably broad:
  - `e2e/smoke.spec.ts` — login/signup, mobile nav, jobs→invoice→payment→reports
    flow, invoice PDF, delivery challan.
  - `e2e/dashboard.spec.ts` — company-filtered KPIs + 6-month charts.
  - `e2e/supabase.spec.ts` — login → create → write-through → clear cache →
    re-hydrate → cleanup.
  - `e2e/import-verify.spec.ts` — imported dataset renders.
  - `e2e/site.spec.ts` — marketing site.
  - Configs: `playwright.config.ts` (preview on :4173, Chromium + Pixel 7),
    `playwright.prod.config.ts`.

---

## 17. Migration risks

1. **Data-layer re-platform is the whole game.** Moving from
   "whole-DB-in-localStorage + full-state diff sync" to "per-entity TanStack
   Query + service calls" is effectively a rewrite of `db.ts`/`store.ts`/
   `backend.ts`. The **UI and `repo.ts` rules must be preserved behaviorally.**
2. **Business rules must move server-side.** Today `repo.ts` is the _only_
   mutation path, so client-side enforcement is "safe enough". Once multiple
   clients hit Supabase directly (API-driven), rules like uniqueness, non-negative
   stock, invoice-cancel→DC-release, auto-issue-material-on-job-create, and
   numbering must be enforced in **Postgres (constraints/triggers/RPC or Edge
   Functions)** or they can be bypassed. This is the biggest correctness risk.
3. **Document numbering** via client-incremented `app_state.sequences` is a race
   the moment there are concurrent writers → must become Postgres sequences /
   `RPC`. Behavior (patterns like `JOB-{n}`) must be preserved.
4. **Multi-tenant retrofit touches everything**: `organization_id` on ~13 tables,
   every RLS policy, every query, plus a data backfill for existing rows into a
   default org. High blast radius; must be a dedicated, reversible migration.
5. **Auth/RBAC rework**: removing default creds, collapsing dual-mode (or keeping
   local mode explicitly for offline), introducing real roles + a centralized
   `can()` permission layer, and route guards — without locking out the existing
   super admin / approved users.
6. **`app_state` JSON blob** (settings/sequences/users) needs decomposition into
   real tables (`profiles`, `organization_members`, settings) to be
   multi-tenant-safe and RLS-enforceable.
7. **Preserving data**: the live Supabase project already holds real records.
   Any schema change must be an additive, reversible SQL migration — never a
   drop/recreate. **First verify** whether the base permissive RLS or the
   approval policy is currently live (S3).
8. **Derived data already in SQL** (`material_stock`, `invoice_totals`) is an
   asset — server-side pagination/aggregation should build on it rather than
   re-deriving in the browser.
9. **Own-vs-customer stock split** exists only in TS (`SHOP_SCOPE`) — if stock
   moves to SQL aggregation, the view must gain the `company_id` scoping or the
   split silently breaks.

---

## 18. Recommended migration order

Aligned with the target's phases, sequenced to keep the app shippable at every
step and to de-risk the data layer first.

| Phase                                 | Goal                                                                                                                                                                                                                                                                      | Key guardrail                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **1. Audit** _(this doc)_             | Grounded inventory                                                                                                                                                                                                                                                        | No behavior change                                                                 |
| **2. Baseline**                       | Confirm install/build/test green on the real Supabase project; snapshot current RLS state (S3); take a DB backup                                                                                                                                                          | No behavior change                                                                 |
| **3. Tooling**                        | ESLint + Prettier + Husky + lint-staged + Vitest; add `.env` validation + logger abstraction; **no** feature changes                                                                                                                                                      | Pure additive                                                                      |
| **4. Constants & types**              | Single source for enums/labels/config; derive UI lists from it; delete duplicate string arrays                                                                                                                                                                            | Behavior-preserving                                                                |
| **5. Service layer + TanStack Query** | Introduce `lib/api` + per-feature `api/` + `hooks/` (`useQuery`/`useMutation`, query keys, invalidation). Wrap the **existing repo** first (adapter), then swap the adapter's backend from localStorage to Supabase reads/writes per entity. Keep repo rules as the spec. | Migrate module-by-module; E2E must stay green                                      |
| **6. Server-side rules**              | Port `repo.ts` invariants + numbering into Postgres (constraints/triggers/RPC/Edge Functions); make them the enforcement of record                                                                                                                                        | Additive SQL migrations; reversible                                                |
| **7. Forms**                          | RHF + Zod schemas (authored from repo rules) across all forms                                                                                                                                                                                                             | Per-form, behavior-preserving                                                      |
| **8. State cleanup**                  | Zustand for UI state (sidebar/modal/theme/filters); remove localStorage-as-source-of-truth (keep only UI prefs / optional offline cache)                                                                                                                                  | —                                                                                  |
| **9. UI system**                      | Tailwind 4 + shadcn/ui + Radix + Motion; keep green brand; modernize tables (TanStack Table), empty/loading/error states, StatCards                                                                                                                                       | Visual parity first, then polish                                                   |
| **10. Security & multi-tenant**       | Remove default creds; centralized RBAC + route guards; `organizations`/`organization_members`; `organization_id` + tenant-isolating RLS; decompose `app_state`                                                                                                            | Dedicated reversible migration + backfill; explicit approval before prod DB change |
| **11. Performance**                   | Server-side pagination/filter/aggregation on list + dashboard/report queries; route-level lazy loading; drop unbounded `SELECT *`                                                                                                                                         | Measure before/after                                                               |
| **12. Testing & hardening**           | Vitest for computations/rules/permissions; Playwright for the 15 critical flows; error boundaries; Sentry hook; docs (`ARCHITECTURE/DATABASE/API/AUTHORIZATION/SECURITY/TESTING/DEPLOYMENT`)                                                                              | —                                                                                  |

**React 19 / Router upgrade** (target §2) folds into Phase 3 (deps) but is
validated continuously; treat React 19 as its own checkpoint because
`react-query`, `recharts`, and RHF majors must be confirmed compatible.

---

## 19. Open questions for the product owner

These affect scope and must not be answered by inventing behavior (target §40):

1. **Machines & QC:** the target lists Machines, Job Cards, QC as modules. Today
   there is **no machine entity**, **no job-card entity**, and QC is only
   `rejectedQty`. Are these **new features** to build, or should the audit's
   real modules define scope? (Default assumption: modernize what exists; treat
   machines/job-cards/QC as future additions unless you confirm otherwise.)
2. **Multi-tenant now or later?** Is MSM going live as a single shop
   (Sree Balaji Industries) with multi-tenant _prepared but dormant_, or do you
   need real tenant isolation immediately? This decides Phase 10's timing.
3. **Local (offline) mode:** keep it as a deliberate offline capability, or drop
   it and standardize on Supabase-only?
4. **RLS state:** confirm whether `supabase-approval-policy.sql` has been applied
   to the live project (I will verify in Phase 2).
5. **Roles:** which of the target's suggested roles (Admin/Manager/Production/
   Store/QC/Operator/Accounts/Viewer) are real for this shop? Today only
   SuperAdmin/User exist.

---

_End of Phase 1 audit. Awaiting review before Phase 2._
