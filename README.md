# CNC Machine Shop Management System

A compact, responsive web app for a small CNC machine shop to manage
company-wise **job orders, raw-material stock, production progress, invoices,
payments and shop-floor expenses** — with a single operational view of what is
pending, in production, completed, invoiced, paid and spent.

Built to the PRD v1.0 (`CNC_Machine_Shop_Management_PRD_v1.0`).

## Tech stack

| Layer               | Choice                                                       |
| ------------------- | ------------------------------------------------------------ |
| Frontend            | React 18 + TypeScript + Vite                                 |
| UI                  | Tailwind CSS, Lucide icons                                   |
| Data (server-state) | TanStack Query provider + reactive local store               |
| Forms/validation    | React Hook Form pattern + Zod available                      |
| Charts              | Recharts                                                     |
| Persistence         | Supabase / PostgreSQL (active) with automatic local fallback |
| Hosting             | Netlify (static SPA, free tier)                              |
| E2E tests           | Playwright (desktop + mobile)                                |

### Data architecture

All data access goes through a repository abstraction (`src/data/repo.ts`) that
owns every business rule (uniqueness, non-negative stock, outstanding
calculation, audit logging). Two interchangeable backends sit behind it:

- **Supabase / PostgreSQL (active in production).** When `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` are set, the app signs in with **Supabase Auth**,
  **hydrates** the store from Postgres on boot, and **writes through** every
  change (diff-based, foreign-key-safe ordering). Data is shared across devices
  and protected by row-level security. Schema: `docs/supabase-schema.sql`.
- **Local (`localStorage`) fallback.** With no env vars the same app runs as a
  pure static SPA with zero backend cost — useful for demos and offline use.

Because the repository is the only mutation path, no feature page knows which
backend is active.

**Supabase setup** (already applied to the production project):

1. Run `docs/supabase-schema.sql` in the Supabase SQL Editor.
2. Create an auth user (Authentication → Users) and disable "Confirm email".
3. Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (Netlify env / local `.env`).

`scripts/run-schema.mjs` and `scripts/create-user.mjs` automate steps 1–2 (they
read the DB password / credentials from environment variables — never source).

> **Login:** the production site uses your Supabase email/password. In local mode
> the default is `admin` / `admin123` (change it in Settings). Use
> **Settings → Data & Backup** for JSON export/restore.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Default login: **admin / admin123** (change it in Settings after first sign-in).
In **Settings → Data & Backup** you can **Load demo data** for a populated example.

## Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Start the dev server                     |
| `npm run build`    | Type-check + production build to `dist/` |
| `npm run preview`  | Preview the production build             |
| `npm run lint`     | Type-check only                          |
| `npm run test:e2e` | Run Playwright smoke tests               |

## Features (MVP scope)

- **Dashboard** — KPI cards, cash-flow & expense charts, priority jobs, low-stock
  alerts, recent payments/expenses. All values computed from transactional data.
- **Companies** — customer master with codes, GSTIN, active/inactive.
- **Job Orders** — create/edit, status, priority, due dates, quantities, overdue flag.
- **Production** — job queue by priority, start/hold/complete/deliver with history.
- **Inventory** — material master, receipts, issues (with stock guard),
  adjustments, company-wise + overall balances, low/negative stock validation.
- **Invoices** — build from completed jobs or manually, line items, discount/tax,
  status lifecycle, print-friendly view.
- **Payments** — full/partial/advance, method, auto-recalculated outstanding.
- **Expenses** — categorised shop-floor expenses with company/job allocation.
- **Reports** — job, stock, movement, invoice, payment, expense, outstanding —
  all filterable with **CSV export**.
- **Settings** — master data (units, material types, expense categories),
  document numbering, shop profile, currency/tax, backup/restore, password.

## Project structure

```
src/
  data/            repository, computations, local store, seed & demo data
  components/       ui primitives, layout (sidebar/topbar/bottom-nav), common
  features/         auth, dashboard, companies, jobs, production, materials,
                    invoices, payments, expenses, reports, settings
  lib/              formatting, csv, id/number helpers
  types/            domain model (PRD §7)
docs/
  supabase-schema.sql   production Postgres schema (constraints, triggers, RLS)
e2e/                Playwright smoke tests
```

## Deployment (Netlify)

The repo includes `netlify.toml` (build `npm run build`, publish `dist`, SPA
redirect). Connect the GitHub repo in Netlify or deploy via CLI:

```bash
npm run build
netlify deploy --prod --dir=dist
```

## Business rules enforced

Job/invoice/receipt/payment numbers unique · companies with transactions can't be
deleted (inactivate instead) · stock never silently negative · invoice totals &
outstanding are system-calculated · positive payment amounts · completed qty ≤
ordered (unless overproduction enabled) · cancelled financial docs kept in
history · configurable INR currency.

## Roadmap (PRD Phase 2)

Machine scheduling · operator/utilisation · operation routing · job costing &
profitability · purchase/supplier management · delivery challans · invoice PDF &
WhatsApp/email · barcode/QR · multi-branch · payment reminders · PWA/offline.
