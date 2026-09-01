# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CNC / machine-shop management system (single-tenant SaaS): companies, job orders,
production, inventory, invoices, payments, expenses, delivery challans, reports.
The frontend was migrated from Vite + react-router-dom to **TanStack Start +
TanStack Router** (file-based routes); the active work lives on the
`migrate/tanstack-start` branch, not `main`.

## Commands

Run all commands from the `mymachineshopmanager/` directory (the git root).

| Command                           | Purpose                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                     | Dev server on http://localhost:5173                                    |
| `npm run build`                   | SSR production build to `dist/` (public pages SSR, `/app` client-only) |
| `SPA=1 npm run build`             | Static SPA shell to `dist/client/` (used by Vercel)                    |
| `npm run preview`                 | Serve the built app (used by Playwright)                               |
| `npm run typecheck`               | `tsc --noEmit` — the real type gate                                    |
| `npm run lint` / `lint:fix`       | ESLint (flat config, non-type-aware)                                   |
| `npm run format` / `format:check` | Prettier                                                               |
| `npm run test`                    | Vitest (unit) once; `test:watch`, `test:coverage` also exist           |
| `npm run test:e2e`                | Playwright (chromium + Pixel-7 mobile) against a fresh build           |
| `npm run test:e2e:prod`           | Playwright against the deployed prod site                              |

Run a single unit test: `npx vitest run src/data/computations.test.ts`
Run a single e2e test: `npx playwright test e2e/portal-nav.spec.ts --project=chromium`

Pre-commit runs `lint-staged` (eslint --fix + prettier) via Husky. A full green
checkpoint is: `npm run typecheck && npm run lint && npm run test && npm run build`.

## Architecture

### Routing & rendering (TanStack Start)

- Entry is `src/router.tsx` (`getRouter()` builds a per-request Router +
  QueryClient) plus file routes in `src/routes/` and generated `routeTree.gen.ts`.
  There is **no** `index.html` / `main.tsx` / `App.tsx` — those were deleted in
  the migration.
- `src/routes/__root.tsx` wraps the tree in `QueryClientProvider` + `AuthProvider`.
- **Public marketing/blog routes** (`/`, `/blog`, `/blog/$slug`, `/login`,
  `/signup`) are server-rendered for SEO.
- **`/app/*` is the authenticated portal and is `ssr: false`** (see
  `src/routes/app/route.tsx`) so localStorage / Supabase-session / chart / PDF
  code never runs on the server. Unknown `/app/*` paths redirect to `/app`.
- When adding/moving routes, keep existing `/app/...` URLs stable and keep any
  browser-only code out of SSR'd routes.

### Feature-first structure

Each domain under `src/features/<domain>/` follows the same shape:

- `api/<domain>Api.ts` — **Supabase-direct** data access (async functions).
- `hooks/use<Domain>.ts` — TanStack Query `useQuery`/`useMutation` wrappers;
  mutations `invalidateQueries` on the relevant `qk.*` keys.
- `<Domain>Page.tsx` + forms — UI only; they call the hooks, never Supabase.

Shared data-access primitives live in `src/lib/api/`:

- `supabaseCrud.ts` — generic select/insert/update/delete for simple entities.
- `rowMap.ts` — TS-entity ⇆ DB-row (snake_case) mapping per table.
- `numbering.ts` — server-atomic document numbers (job/invoice/challan…).
- `queryKeys.ts` (`qk`) — the single source of query keys.
- `errors.ts` — maps DB/`BusinessRuleError` failures to user messages.

**Rule-bearing mutations go through Postgres RPCs, not table writes.** e.g.
`create_job` / `transition_job` (auto-issue material, emit production events,
atomic), invoice/payment/challan RPCs. Simple, rule-free entities use
`supabaseCrud`. When a change must be atomic or enforce a business rule, add/extend
an RPC in `supabase/migrations/` rather than doing multi-step writes client-side.

### Shared business logic — preserve

`src/data/computations.ts` holds pure calculation functions (outstanding,
totals, stock balances, KPIs) used by ~13 pages and covered by
`computations.test.ts`. Treat it as the domain-rule core; don't duplicate its
logic in pages.

### Legacy data layer (mostly inert — do not build on it)

`src/data/{store.ts,db.ts,demo.ts,seed.ts,backend.ts}` and the `useDb`/`useMaybeDb`
localStorage store are leftovers from the pre-migration architecture. Pages read
Supabase directly now; write-through sync is disabled. The only live consumers of
`src/data/repo.ts` are `features/auth` (local-mode `userRepo`, `BusinessRuleError`)
and `lib/api/errors.ts`. Prefer the feature `api/` + `lib/api/` path for new work.

### Auth

`src/features/auth/auth.tsx` provides `AuthProvider` / `useAuth`. Registration is
gated by an **approval workflow**: new sign-ups land as `pending` and cannot enter
until a super-admin approves them. Profiles + approval state live in the
`app_state` JSON blob (no separate users table); super-admins are emails in
`SUPER_ADMIN_EMAILS`. A localStorage/SHA-256 local-mode fallback exists for
running with no backend configured.

## Backend / config

- Supabase is configured via `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
  (`.env`, gitignored). Only the **anon** key belongs in the frontend — never the
  service_role key. `src/lib/env.ts` reads env.
- Schema and DB objects: `supabase/migrations/000X_*.sql` (numbered, apply in
  order) plus reference SQL in `docs/`. Constraints, triggers, RPCs and RLS live
  in Postgres.
- Path alias `@/*` → `src/*` is defined in three places that must stay in sync:
  `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`.
- Deploy targets: **Vercel** (`vercel.json`, static SPA build + rewrites to
  `/_shell.html`) and legacy **Netlify** (`netlify.toml`). `scripts/*.mjs` cover
  schema apply, user creation, data import, and `npm run deploy`.

## Migration docs

Design/decision records for the TanStack Start migration are under `docs/`:
`frontend-architecture.md`, `frontend-migration-audit.md`,
`frontend-route-migration.md`, `frontend-feature-parity.md`,
`frontend-migration-notes.md`. Read these before touching routing or the SSR/SPA
build split.

## Gotchas

- **Windows + Playwright:** git-bash `pkill` does not kill `node.exe`. A stale
  `preview` server on the e2e port serves an old build (404 assets → no
  hydration). Free it with PowerShell:
  `Get-NetTCPConnection -LocalPort 4173 | Stop-Process`.
- `npm run lint` does **not** type-check (flat config is intentionally
  non-type-aware for speed); run `npm run typecheck` for type errors.
- `console.*` is lint-blocked everywhere except `src/lib/logger.ts` — log through
  the logger.
