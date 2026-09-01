# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CNC / machine-shop management system (single-tenant SaaS): companies, job orders,
production, inventory, invoices, payments, expenses, delivery challans, reports.
**Framework: Next.js App Router** (migrated from Vite + TanStack Start in 2026-09;
see `MIGRATION_PROGRESS.md` for the full record). Active work happens on the
`dev` branch; production deploys from `main` (Vercel).

## Commands

Run all commands from the `mymachineshopmanager/` directory (the git root).

| Command                           | Purpose                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                     | Next dev server on http://localhost:3000                     |
| `npm run build`                   | Production build (`next build`)                              |
| `npm run start`                   | Serve the production build (`next start`)                    |
| `npm run typecheck`               | `tsc --noEmit` — the real type gate                          |
| `npm run lint` / `lint:fix`       | ESLint (flat config, non-type-aware)                         |
| `npm run format` / `format:check` | Prettier                                                     |
| `npm run test`                    | Vitest (unit) once; `test:watch`, `test:coverage` also exist |
| `npm run test:e2e`                | Playwright (chromium + Pixel-7) against a fresh `next build` |
| `npm run test:e2e:prod`           | Playwright against the deployed prod site                    |

Run a single unit test: `npx vitest run src/data/computations.test.ts`
Run a single e2e test: `npx playwright test e2e/site.spec.ts --project=chromium`

Pre-commit runs `lint-staged` (eslint --fix + prettier) via Husky. A full green
checkpoint is: `npm run typecheck && npm run lint && npm run test && npm run build`.

## Architecture

### Routing & rendering (Next.js App Router)

- Routes live in `app/`: public pages (`/`, `/blog`, `/blog/[slug]`) are Server
  Components (SSR/SSG, SEO via the Metadata API + `app/_site/json-ld.tsx`);
  the authenticated portal `app/app/**` is a client tree — `app/app/layout.tsx`
  (`'use client'`) gates on auth and wraps pages in `app/_shell/app-shell.tsx`.
- `app/providers.tsx` (client): QueryClient (staleTime 30 000, no refetch on
  focus) → AuthProvider → ToastProvider → ConfirmProvider → AppLink/Nav bridges.
- Hub redirects (`/app/accounts` → `/app/expenses` etc.) are server `redirect()`
  pages; catch-alls: `app/[...rest]` → `/`, `app/app/[...rest]` → `/app`.
- Navigation in SHARED feature components goes through the framework-agnostic
  `AppLink` / `useAppNavigate()` (`src/components/nav/app-link.tsx`); the Next
  adapters live in `app/_shell/next-app-link.tsx`. Do not import `next/link`
  or `next/navigation` inside `src/features/**`.

### Feature-first structure (`src/`)

Each domain under `src/features/<domain>/` follows the same shape:

- `api/<domain>Api.ts` — **Supabase-direct** data access (async functions).
- `hooks/use<Domain>.ts` — TanStack Query wrappers; mutations invalidate `qk.*` keys.
- `<Domain>Page.tsx` + forms — UI only; they call the hooks, never Supabase.

Shared data-access primitives live in `src/lib/api/` (`supabaseCrud`, `rowMap`,
`numbering`, `queryKeys`, `errors`). **Rule-bearing mutations go through
Postgres RPCs, not table writes** (e.g. `create_job`, `transition_job`) — add or
extend RPCs in `supabase/migrations/` for anything atomic/rule-enforcing.
`src/data/computations.ts` is the pure calculation core (26 unit tests) — never
duplicate its logic.

### Design system

- Tokens: industrial orange (`brand.*`, action `#ea580c`) + `charcoal.*` for the
  sidebar; shadcn HSL variables in `src/index.css`; Tailwind config maps both.
- shadcn/ui components are generated into `src/components/ui/shadcn/` (see
  `components.json`; add more via `npx shadcn add <name>`). Hand-written app
  components in `src/components/ui/` wrap Radix primitives with preserved APIs:
  `Modal` (Radix Dialog), `useConfirm()` (Radix AlertDialog), `useToast()`
  (Sonner). `src/components/common/DataTable.tsx` is the shared typed table.
- Forms migrate progressively to React Hook Form + Zod (`zodResolver`) —
  `AuthForm` and `CompanyForm` are the reference implementations; the remaining
  forms are tracked in `MIGRATION_PROGRESS.md` (InvoiceForm last, with
  calculation cross-checks).

### Auth

`src/features/auth/auth.tsx` provides `AuthProvider` / `useAuth`. Registration is
gated by an approval workflow (pending → super-admin approves). Profiles live in
the `app_state` JSON blob; super-admins are emails in `SUPER_ADMIN_EMAILS`. A
localStorage local-mode fallback exists when Supabase env is absent.

## Backend / config

- Supabase env: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (`.env`, gitignored). `next.config.mjs` also bridges legacy `VITE_SUPABASE_*`
  values at build time (hosting still defines those); `src/lib/env-public.ts` is
  the cross-runtime reader. Only the anon key belongs client-side.
- Schema/RPCs/RLS: `supabase/migrations/000X_*.sql` (numbered, apply in order).
- Path alias `@/*` → `src/*` (tsconfig `paths`; vitest.config mirrors it).
- Deploy: **Vercel** (`vercel.json`, framework nextjs; production from `main`,
  previews from `dev`). Netlify config targets the Next runtime plugin.

## Migration docs

`MIGRATION_AUDIT.md`, `MIGRATION_BASELINE.md`, `ROUTE_MIGRATION_MAP.md`,
`UI_MIGRATION_MAP.md`, `MIGRATION_PROGRESS.md`, `CLEANUP_PLAN.md` record the
Vite→Next migration decisions. Read `MIGRATION_PROGRESS.md` before resuming any
remaining work (forms rollout, DataTable rollout, env-var rename).

## Gotchas

- **Windows + Playwright:** a stale server on the e2e port serves an old build.
  Free it with PowerShell: `Get-NetTCPConnection -LocalPort 3200 | Stop-Process`.
- `npm run lint` does **not** type-check; run `npm run typecheck`.
- `console.*` is lint-blocked everywhere except `src/lib/logger.ts`.
- The e2e suite has 9 auth-gated specs that fail in headless environments
  without seeded credentials — identical before and after the migration
  (see `MIGRATION_BASELINE.md`); site/robots specs must always pass.
- Verifying `/app/**` requires an authenticated session — drive login via
  Playwright MCP; `<html id="__next_error__">` in the live DOM while
  `fetch(url)` returns good HTML means a client-side crash (check for stray
  TanStack imports in shared components).
