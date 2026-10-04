# My Machine Shop Manager — Complete Application Documentation

> CNC / machine-shop management system (multi-tenant SaaS). Manages the full
> operational lifecycle of a precision manufacturing shop: companies/customers,
> job orders, production, inventory & materials, tool room, invoicing, payments &
> settlements, expenses, accounts & finance, HRM, CRM, delivery challans, GST
> compliance, and reporting.

- **Repository:** `mymachineshopmanager` (git root is this folder)
- **Branches:** active work on `dev`; production deploys from `main`
- **Hosting:** Vercel (primary), Netlify config present as fallback
- **Backend:** Supabase (Postgres + Auth + RLS + RPCs), project ref `ydhvsiixwmbxoumglpvq`
- **Framework:** Next.js 16 App Router (migrated from Vite + TanStack Start, Sept 2026)

---

## 1. Technology Stack

### 1.1 Language & Runtime

| Technology | Version            | Role                                                  |
| ---------- | ------------------ | ----------------------------------------------------- |
| TypeScript | ^5.7.2             | Primary language (strict), `@/*` → `src/*` path alias |
| Node.js    | ≥ 20.9.0 (engines) | Build/dev runtime; dev machine on v24                 |
| ES Modules | `"type": "module"` | All JS/TS is ESM                                      |

### 1.2 Frontend

| Technology               | Version     | Role                                                                                   |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| Next.js                  | ^16.3.4     | App Router — SSR/SSG for public site, client tree for the portal                       |
| React                    | ^18.3.1     | UI library                                                                             |
| React DOM                | ^18.3.1     | DOM renderer                                                                           |
| TanStack React Query     | ^5.62.7     | Server-state caching & mutations (staleTime 30 000, no refetch-on-focus)               |
| React Hook Form          | ^7.54.1     | Form state (progressive rollout)                                                       |
| Zod                      | ^3.24.1     | Schema validation (`zodResolver` via `@hookform/resolvers` ^3.9.1)                     |
| Tailwind CSS             | ^3.4.16     | Utility-first styling (+ `tailwindcss-animate`, `tailwind-merge`, `clsx`)              |
| shadcn/ui                | (generated) | Component layer in `src/components/ui/shadcn/`                                         |
| Radix UI                 | ^1.x        | Primitives: dialog, alert-dialog, dropdown-menu, label, separator, slot, tabs, tooltip |
| class-variance-authority | ^0.7.1      | Variant-driven component styling                                                       |
| lucide-react             | ^0.468.0    | Icon set                                                                               |
| Recharts                 | ^2.14.1     | Charts/graphs (dashboards & reports)                                                   |
| Sonner                   | ^2.0.8      | Toast notifications (`useToast`)                                                       |
| date-fns                 | ^4.1.0      | Date utilities                                                                         |

### 1.3 Backend / Data

| Technology                         | Version            | Role                                                                            |
| ---------------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| Supabase (`@supabase/supabase-js`) | ^2.112.3           | Postgres DB, Auth, Row-Level Security, Storage, RPCs                            |
| PostgreSQL                         | (Supabase-managed) | ~100 tables, 102 `public` routines (RPCs/functions), RLS-enforced multi-tenancy |
| `pg`                               | ^8.23.0 (dev)      | Direct Postgres access for migration/maintenance scripts                        |

### 1.4 Document / Data Processing

| Technology        | Version  | Role                                                       |
| ----------------- | -------- | ---------------------------------------------------------- |
| jsPDF             | ^4.2.1   | Client-side PDF generation (invoices, challans, reports)   |
| pdfjs-dist        | ^4.10.38 | PDF parsing (bank-statement import)                        |
| tesseract.js      | ^5.1.1   | OCR (scanned documents; `eng.traineddata` bundled)         |
| `src/lib/xlsx.ts` | custom   | Dependency-free CSV/XLSX parser (bank import, data import) |

### 1.5 Testing & QA

| Technology      | Version                                              | Role                                             |
| --------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Vitest          | ^3.2.7                                               | Unit tests (+ `@vitest/coverage-v8`)             |
| jsdom           | ^30.0.1                                              | DOM env for component tests                      |
| Testing Library | react ^16.3.3 / user-event ^14.6.7 / jest-dom ^7.0.1 | Component testing                                |
| Playwright      | ^1.49.1                                              | E2E (chromium + Pixel-7), prod smoke, QA harness |

### 1.6 Tooling & Quality Gates

| Technology                | Version            | Role                                                                                             |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| ESLint                    | ^9.39.5            | Flat config (`eslint.config.js`), non-type-aware; `console.*` blocked except `src/lib/logger.ts` |
| typescript-eslint         | ^8.68.0            | TS lint rules                                                                                    |
| eslint-plugin-react-hooks | ^5.2.0             | Hooks lint rules                                                                                 |
| Prettier                  | ^3.9.6             | Formatting (`.prettierrc.json`)                                                                  |
| Husky                     | ^9.1.7             | Git hooks (`prepare`)                                                                            |
| lint-staged               | ^15.5.2            | Pre-commit: eslint --fix + prettier                                                              |
| PostCSS / Autoprefixer    | ^8.4.49 / ^10.4.20 | CSS pipeline                                                                                     |

### 1.7 Deployment & Infra

| Technology                    | Role                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Vercel                        | Primary host (`vercel.json`, framework `nextjs`); prod from `main`, previews from `dev` |
| Netlify                       | Alternate host config (`netlify.toml`, Next runtime plugin)                             |
| Supabase CLI / Management API | Migrations, SQL, project admin                                                          |

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js App Router (app/)                                     │
│                                                                │
│  Public site (Server Components, SSR/SSG, SEO)                 │
│    /  /about  /features/[slug]  /industries/[slug]  /blog/...  │
│    /login  /signup  /forgot-password  /reset-password /contact │
│                                                                │
│  Authenticated portal (app/app/**  → 'use client' tree)       │
│    app/app/layout.tsx  (auth gate)                             │
│      └─ app/_shell/app-shell.tsx  (nav + chrome)              │
│          └─ feature pages → feature components (src/features)  │
│                                                                │
│  API route handlers (app/api/einvoice, app/api/eway)          │
└───────────────┬──────────────────────────────────────────────┘
                │  framework-agnostic feature layer
                ▼
┌──────────────────────────────────────────────────────────────┐
│  src/features/<domain>/                                        │
│    <Domain>Page.tsx + forms   (UI only)                        │
│    hooks/use<Domain>.ts       (TanStack Query wrappers)        │
│    api/<domain>Api.ts         (Supabase-direct data access)    │
└───────────────┬──────────────────────────────────────────────┘
                │  shared primitives: src/lib/api/*
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Supabase (Postgres)                                           │
│    Tables (~100) · RPCs (102) · RLS · tenant_id isolation      │
│    Auth (approval-gated) · Storage                             │
└──────────────────────────────────────────────────────────────┘
```

**Core architectural rules**

1. **Feature-first.** Each domain lives under `src/features/<domain>/` with the
   same three-layer shape: `api/` (Supabase-direct) → `hooks/` (Query wrappers)
   → page/forms (UI only). UI never calls Supabase directly.
2. **Rule-bearing mutations go through Postgres RPCs**, not raw table writes
   (e.g. `create_job`, `transition_job`, `tool_move`, numbering). Anything
   atomic or rule-enforcing is a SQL function in `supabase/migrations/`.
3. **Framework-agnostic navigation.** Shared feature components use `AppLink` /
   `useAppNavigate()` (`src/components/nav/`), never `next/link` or
   `next/navigation` directly. Next adapters live in `app/_shell/`.
4. **Pure calculation core.** `src/data/computations.ts` holds all shared
   financial/quantity math (unit-tested) — never duplicate its logic.

---

## 3. Directory Structure

```
mymachineshopmanager/
├── app/                      # Next.js App Router (routes, layouts, API handlers)
│   ├── _shell/               # Portal chrome: app-shell, Next AppLink adapters
│   ├── _site/                # Public-site helpers (json-ld, metadata)
│   ├── api/                  # Route handlers: einvoice, eway
│   ├── app/                  # Authenticated portal (client tree) — all modules
│   ├── providers.tsx         # QueryClient → Auth → Toast → Confirm → Nav bridges
│   └── (public pages)        # /, about, features, industries, blog, auth pages
├── src/
│   ├── components/           # ui/ (shadcn + hand-written), common/ (DataTable), nav/
│   ├── constants/            # App-wide constants
│   ├── data/                 # computations.ts (pure calc core) + tests
│   ├── features/             # 24 domain modules (see §5)
│   ├── hooks/                # Shared React hooks
│   ├── lib/                  # api/, seo/, format, brand, env, logger, xlsx, image, utils
│   ├── server/               # Server-only providers (einvoiceProvider.ts)
│   ├── test/                 # Test setup/utilities
│   ├── types/                # Shared TypeScript types
│   └── index.css             # Tailwind + shadcn HSL variables
├── supabase/migrations/      # 0001–0059 numbered SQL (schema, RPCs, RLS)
├── scripts/                  # Node maintenance/migration/import/QA/SEO scripts
├── e2e/                      # Playwright specs + support
├── qa/                       # QA-Orchestra harness (reports, test cases)
├── docs/                     # Architecture & migration documentation (see §16)
├── public/                   # Static assets
├── eng.traineddata           # Tesseract OCR English model
└── (config files)            # next.config.mjs, tailwind, tsconfig, eslint, vitest, playwright.*
```

---

## 4. Routing (Next.js App Router)

### 4.1 Public site (Server Components — SSR/SSG, SEO-indexed)

| Route                                                      | Purpose                               |
| ---------------------------------------------------------- | ------------------------------------- |
| `/`                                                        | Marketing home                        |
| `/about`                                                   | About page                            |
| `/features/[slug]`                                         | Feature landing pages (SEO)           |
| `/industries/[slug]`                                       | Industry landing pages (SEO)          |
| `/blog`, `/blog/[slug]`                                    | Blog index + posts                    |
| `/contact`                                                 | Contact form → CRM `contact_messages` |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Auth flows                            |

SEO is handled via the Next Metadata API + `app/_site/json-ld.tsx`; dynamic
`robots` and `sitemap`; `/app/**` is hard-`noindex` via `X-Robots-Tag` header.

### 4.2 Authenticated portal (`app/app/**` — client tree)

`app/app/layout.tsx` (`'use client'`) gates on auth and wraps everything in
`app/_shell/app-shell.tsx`. Hub routes (e.g. `/app/accounts` → `/app/expenses`)
are server `redirect()` pages; catch-alls `app/[...rest]` → `/` and
`app/app/[...rest]` → `/app`.

Portal module routes:

- **Sales/Ops:** `companies`, `vendors`, `jobs`, `production`,
  `production-planning`, `sales`, `subcontracting`, `supply-chain`
- **Inventory:** `inventory/{dashboard,materials,movements,adjustments,transfers,history,reports}`, `materials`
- **Tool Room:** `tool-room/{tools,inventory,issue,return,transfers,reservations,calibration,maintenance,categories,ledger,reports,settings}`
- **Invoicing & Payments:** `invoices/[id]/print`, `payments`, `deliveries/[id]/print`, `expenses`
- **Accounts & Finance:** `accounts/{ledger,journals,chart-of-accounts,bank-accounts,bank-import,reconciliation,financials,periods,gst,gst-returns,tax-config,einvoice,eway}`
- **HRM:** `hrm/{employees/[id],attendance,leave,payroll,shifts,holidays,designations,organization,documents,assets,expenses,recruitment,performance,training,reports,settings}`
- **CRM:** `crm`
- **Admin:** `approvals`, `roles`, `configuration`, `settings`, `reports`

### 4.3 API route handlers

| Route              | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `app/api/einvoice` | GST e-invoice generation (IRN) — backed by `src/server/einvoiceProvider.ts` |
| `app/api/eway`     | GST e-way bill generation                                                   |

---

## 5. Feature Modules (`src/features/`)

24 domains, each following the `api/` → `hooks/` → page/forms shape:

| Module            | Responsibility                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `auth`            | AuthProvider/useAuth, approval-gated registration, super-admin allow-list                           |
| `access`          | Access-control / RBAC primitives                                                                    |
| `approvals`       | User approval workflow (super-admin reviews pending signups)                                        |
| `companies`       | Customer/company master (Supabase-direct CRUD, server-minted codes)                                 |
| `vendors`         | Vendor/supplier master                                                                              |
| `crm`             | Contact messages / CRM module                                                                       |
| `jobs`            | Job orders — created/transitioned via RPCs                                                          |
| `production`      | Production events & tracking                                                                        |
| `inventory`       | Stock ledger, transfers, adjustments, movements, reports                                            |
| `materials`       | Material master, issues, receipts                                                                   |
| `toolroom`        | Tool inventory, issue/return, calibration, maintenance (transaction-driven via `tool_move`)         |
| `subcontracting`  | Subcontract orders & documents                                                                      |
| `invoices`        | Invoices + line items, PDF generation                                                               |
| `payments`        | Receivables, multi-invoice allocation, settlements, deductions (TDS/freight)                        |
| `expenses`        | Expense capture, payee/category, cash withdrawals                                                   |
| `finance`         | Double-entry ledger, journals, chart of accounts, bank import, GST, reconciliation                  |
| `hrm`             | Full HRM: employees, attendance, leave, payroll, shifts, recruitment, performance, training, assets |
| `sales`           | Sales views                                                                                         |
| `deliveries`      | Delivery challans + print                                                                           |
| `dashboard`       | Summary panels, stat tiles, charts                                                                  |
| `reports`         | Cross-module reporting                                                                              |
| `settings`        | App/tenant settings                                                                                 |
| `tenant`          | Client-side multi-tenant context                                                                    |
| `shared` / `site` | Shared feature utilities / public-site content                                                      |

---

## 6. Data Access Layer

Shared primitives in `src/lib/api/`:

| File              | Role                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `supabaseCrud.ts` | Generic `selectAll` / `insertRow` / `updateRow` / `deleteRow`     |
| `rowMap.ts`       | Table ↔ TS type mapping (`maps.*`)                                |
| `numbering.ts`    | Server-counter document numbering (`nextCode`, race-safe via RPC) |
| `queryKeys.ts`    | `qk.*` TanStack Query keys (mutations invalidate these)           |
| `errors.ts`       | Error normalization                                               |

Other `src/lib/` utilities: `format.ts`, `brand.ts`, `env.ts` / `env-public.ts`
(cross-runtime env reader), `logger.ts` (only sanctioned `console`), `xlsx.ts`
(CSV/XLSX parser), `image.ts`, `utils.ts`, `app-seo.ts`, `site-meta.ts`, `seo/`.

---

## 7. Database (Supabase / PostgreSQL)

- **~100 base tables** in `public`, **102 routines** (RPCs/functions).
- **Migrations:** `supabase/migrations/0001_*.sql` → `0059_*.sql`, applied in
  numeric order. Covers schema, RPCs, RLS, numbering, multi-tenancy, HRM,
  finance, tool room, settlements.

### 7.1 Table groups (representative)

- **Core/ops:** `companies`, `vendors`, `suppliers`, `products`, `job_orders`,
  `production_events`, `delivery_challans`, `subcontracts`, `subcontract_orders`,
  `subcontract_docs`, `party_aliases`
- **Inventory/materials:** `materials`, `material_issues`, `material_receipts`,
  `stock_adjustments`, `stock_transfers`, `own_material_purchases`
- **Tool room:** `tools`, `tool_categories`, `tool_transactions`,
  `tool_calibrations`, `tool_maintenance`, `tool_reservations`
- **Billing & money:** `invoices`, `invoice_lines`, `payments`,
  `payment_allocations`, `payment_deductions`, `advance_repayments`,
  `expenses`, `expense_categories`, `expense_claims`, `doc_counters`
- **Accounts/finance:** `chart_of_accounts`, `journals`, `journal_lines`,
  `accounting_periods`, `fiscal_years`, `bank_accounts`, `bank_transactions`,
  `bank_statement_files`, `bank_txn_rules`
- **GST/compliance:** `gst_registrations`, `gst_return_periods`, `gst_tax_rates`,
  `hsn_codes`, `einvoice_records`, `eway_bills`
- **HRM:** `employees`, `departments`, `designations`, `attendance`, `shifts`,
  `shift_assignments`, `holidays`, `leave_types`, `leave_applications`,
  `leave_balances`, `payroll_runs`, `payroll_periods`, `payroll_records`,
  `salary_structures`, `salary_structure_lines`, `salary_components`,
  `employee_salary`, `employee_advances`, `employee_assets`, `asset_assignments`,
  `employee_documents`, `employee_training`, `employee_status_history`,
  `candidates`, `job_openings`, `job_offers`, `interview_rounds`,
  `training_programs`, `training_sessions`, `performance_cycles`,
  `performance_goals`, `performance_reviews`, HR RBAC (`hr_roles`,
  `hr_permissions`, `hr_role_permissions`, `hr_user_roles`, `hr_settings`,
  `hr_audit_log`)
- **Platform/tenancy/auth:** `tenants`, `tenant_settings`, `user_tenant_access`,
  `approved_users`, `app_state`, `roles`, `notifications`, `audit_log`,
  `contact_messages`, `document_types`

### 7.2 Multi-tenancy

- True multi-tenant re-architecture (migrations **0039–0048**): every tenant-
  scoped table carries `tenant_id` with `DEFAULT current_tenant_id`, RLS
  policies, cross-tenant guards, tenant-aware numbering, and view security.
- Super-admins (emails in `SUPER_ADMIN_EMAILS`) can reach all tenants but must
  have `app_metadata.active_tenant` set, or numbering/create RPCs raise
  _"No active tenant selected."_ There is no tenant-switcher UI yet (set it
  server-side + re-login).

---

## 8. Authentication & Authorization

- `src/features/auth/auth.tsx` provides `AuthProvider` / `useAuth` over Supabase
  Auth.
- **Approval-gated registration:** signup → `pending` → a super-admin approves
  (`approvals` module + `approved_users` table + DB trigger/RPC). Confirmed-but-
  unapproved accounts can authenticate but cannot use the app.
- **Super-admins:** emails in `SUPER_ADMIN_EMAILS` (bypass the approval table).
- **Tenant access:** `user_tenant_access(email, tenant_id, role, status)`.
- **Profiles:** stored in the `app_state` JSON blob.
- **RBAC:** app-level `roles` + dedicated HR RBAC tables for the HRM module.
- **Local-mode fallback:** a localStorage mock exists when Supabase env is absent.
- Only the **anon key** belongs client-side; all reads are RLS-filtered.

---

## 9. Design System

- **Tokens:** industrial orange brand palette (`brand.*`, action `#ea580c`) +
  `charcoal.*` sidebar; shadcn HSL CSS variables in `src/index.css`; Tailwind
  config (`tailwind.config.js`) maps both.
- **Components:** shadcn/ui generated into `src/components/ui/shadcn/` (add via
  `npx shadcn add <name>`, see `components.json`). Hand-written wrappers in
  `src/components/ui/` preserve stable APIs: `Modal` (Radix Dialog),
  `useConfirm()` (Radix AlertDialog), `useToast()` (Sonner).
  `src/components/common/DataTable.tsx` is the shared typed table (with
  `mobileCard`/`hideBelow` responsive support).
- **Forms:** progressively migrating to React Hook Form + Zod (`AuthForm`,
  `CompanyForm` are reference implementations).
- **Responsive:** mobile/tablet pass on authenticated data screens (grid
  breakpoints, DataTable mobile cards, line-item cards).

---

## 10. Environment & Configuration

| Variable                                       | Purpose                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                     | Supabase project URL (client)                                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                | Supabase anon key (client, RLS-safe)                                        |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Legacy names; bridged to `NEXT_PUBLIC_*` at build time in `next.config.mjs` |

- `src/lib/env-public.ts` is the cross-runtime reader. `.env` (gitignored) sets
  `NEXT_PUBLIC_*` locally; see `.env.example`.
- **Path alias:** `@/*` → `src/*` (tsconfig `paths`; mirrored in `vitest.config.ts`).
- **Security headers** (set in `next.config.mjs`, apply on any host):
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and
  `X-Robots-Tag: noindex, nofollow` on all `/app` responses.

---

## 11. Development Workflow & Commands

Run everything from `mymachineshopmanager/`.

| Command                                         | Purpose                                               |
| ----------------------------------------------- | ----------------------------------------------------- |
| `npm run dev`                                   | Next dev server on http://localhost:3000              |
| `npm run build`                                 | Production build (`next build`)                       |
| `npm run start`                                 | Serve the production build                            |
| `npm run typecheck`                             | `tsc --noEmit` — the real type gate                   |
| `npm run lint` / `lint:fix`                     | ESLint (flat config, **not** type-aware)              |
| `npm run format` / `format:check`               | Prettier                                              |
| `npm run test` / `test:watch` / `test:coverage` | Vitest                                                |
| `npm run test:e2e`                              | Playwright (chromium + Pixel-7) against a fresh build |
| `npm run test:e2e:prod`                         | Playwright against the deployed prod site             |
| `npm run qa` / `qa:report` / `qa:csv`           | QA-Orchestra harness + reports + Zephyr CSV           |
| `npm run seo:audit`                             | SEO audit (`scripts/seo-audit.mjs`)                   |
| `npm run deploy`                                | Guided deploy (`scripts/deploy.mjs`)                  |

- **Single unit test:** `npx vitest run src/data/computations.test.ts`
- **Single e2e test:** `npx playwright test e2e/site.spec.ts --project=chromium`
- **Green checkpoint:** `npm run typecheck && npm run lint && npm run test && npm run build`
- **Pre-commit:** Husky runs `lint-staged` (eslint --fix + prettier).

### Maintenance scripts (`scripts/`)

`apply-migration.mjs`, `apply-hrm-migrations.mjs`, `run-schema.mjs`,
`sb-query.mjs`, `create-user.mjs`, `enable-signup.mjs`, `verify-signup.mjs`,
`clear-all.mjs`, `import-apply.mjs`, `import-report.mjs`,
`migrate-dc-products.mjs`, `qa-extract.mjs`, `qa-testcases.mjs`,
`seo-audit.mjs`, `deploy.mjs`, `gen-0026.mjs`, `gen-0027.mjs`.

---

## 12. Testing & QA

- **Unit (Vitest):** core coverage on `src/data/computations.ts` (pure calc) and
  component tests via Testing Library + jsdom.
- **E2E (Playwright):** `e2e/` specs, chromium + Pixel-7 projects. Public
  `site`/`robots` specs must always pass; auth-gated specs need seeded creds.
- **QA-Orchestra** (`qa/`, `playwright.qa.config.ts`): multi-phase agent pipeline
  with Zephyr CSV export, run against a local build + prod backend using an
  isolated QA tenant and token-injection auth.

**Windows gotcha:** a stale server on the e2e port serves an old build — free it
with `Get-NetTCPConnection -LocalPort 3200 | Stop-Process`.

---

## 13. Build & Deployment

- **Vercel** (`vercel.json`, framework `nextjs`): production from `main`,
  previews from `dev`. Security headers now delegated to `next.config.mjs`.
- **Netlify** (`netlify.toml`): alternate host via the Next runtime plugin.
- **Supabase migrations** are applied separately (via scripts / Management API /
  CLI), in numeric order, as part of the release.
- `scripts/deploy.mjs` orchestrates the guided deploy; see
  `docs/DEPLOYMENT_RUNBOOK.md`.

---

## 14. Integrations & Notable Capabilities

- **GST compliance:** e-invoice (IRN) via `app/api/einvoice` + `src/server/einvoiceProvider.ts`; e-way bills via `app/api/eway`; HSN codes, tax rates, GST returns.
- **Bank-statement import:** PDF (pdfjs-dist) / CSV / XLSX parsing → `bank_transactions` with rule-based categorization (`bank_txn_rules`).
- **OCR:** tesseract.js + bundled `eng.traineddata` for scanned documents.
- **PDF generation:** jsPDF for invoices, delivery challans, and reports.
- **Double-entry accounting:** journals/journal_lines, chart of accounts, fiscal years, accounting periods, reconciliation.
- **SEO system:** centralized `src/lib/seo`, dynamic robots/sitemap, feature + industry landing pages, `seo:audit` script.

---

## 15. SEO

Centralized SEO under `src/lib/seo` + `src/lib/app-seo.ts` / `site-meta.ts`.
Public pages use the Next Metadata API and JSON-LD (`app/_site/json-ld.tsx`);
dynamic `robots.txt` and `sitemap.xml`; the `/app` portal is hard-`noindex`
(header + robots disallow + client auth gate). Audit via `npm run seo:audit`.

---

## 16. Reference Documentation (`docs/`)

| Doc                                                                                                                | Topic                                       |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `DATABASE_ARCHITECTURE.md` (+ PDF)                                                                                 | Full schema/architecture                    |
| `DATABASE_AUDIT_REPORT.md`, `DATABASE_FINAL_REVIEW.md`, `DATABASE_SECURITY_VALIDATION.md`                          | DB audits & security                        |
| `DATABASE_MIGRATION_NOTES.md`                                                                                      | Migration notes                             |
| `MULTI_TENANT_DESIGN.md`                                                                                           | Multi-tenant design                         |
| `DEPLOYMENT_RUNBOOK.md`                                                                                            | Deploy procedure                            |
| `frontend-architecture.md`, `frontend-feature-parity.md`, `frontend-migration-*.md`, `frontend-route-migration.md` | Frontend architecture & Vite→Next migration |
| `PHASE_5B_6_PLAN.md`                                                                                               | Phased plan                                 |
| `supabase-*.sql`                                                                                                   | Reference SQL snippets                      |

Root-level migration records: `MIGRATION_AUDIT.md`, `MIGRATION_BASELINE.md`,
`MIGRATION_PROGRESS.md`, `ROUTE_MIGRATION_MAP.md`, `UI_MIGRATION_MAP.md`,
`CLEANUP_PLAN.md`, `SEO_IMPLEMENTATION.md`. See also `CLAUDE.md` for the
condensed working guide.

---

_Generated from the codebase state on the `dev` branch. Versions reflect
`package.json`; database figures reflect the live Supabase project
(`ydhvsiixwmbxoumglpvq`): ~100 tables, 102 routines, migrations 0001–0059._
