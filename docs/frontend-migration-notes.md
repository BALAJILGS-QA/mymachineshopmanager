# Frontend Migration Notes (running log)

Chronological record of decisions, commands, checkpoints, and issues. Newest at top.

---

## 2026-08-29 — Phase 1: Audit (complete)

- Cloned/inspected repo; mapped 89 files / ~15.2k LOC. Branch `migrate/tanstack-start`
  cut from clean `main` (last commit `a9af83d`).
- **Key discovery:** data layer already on TanStack Query + Supabase-direct. `useDb`
  legacy store referenced only by `store.ts`; `data/demo.ts`, `data/db.ts` have no live
  importers → migration is routing/shell-focused.
- Router API surface to port (13 files): `Link`, `NavLink`, `useParams`(6),
  `useNavigate`(10), `useLocation`(2), `Navigate`, `Routes/Route`, `BrowserRouter`.
  **No `useSearchParams`** → no query-string contract.
- SSR decision: **SSR public site only**; `/app/*` stays client-rendered.
- Produced: `frontend-migration-audit.md`, `frontend-route-migration.md`,
  `frontend-feature-parity.md`, `frontend-architecture.md`, this file.

### Decisions

- D1: Keep client-side Supabase Auth (no server session cookie) to avoid behavior change.
- D2: Keep `AuthProvider`/`useAuth`, `data/computations.ts`, all feature `api/`+`hooks/`
  verbatim. Move only routing + app shell + entry points.
- D3: Preserve every URL, incl. `/login`,`/signup`→`/` redirects and the two `/print`
  deep links. Param `:id`→`$id`, `:slug`→`$slug`.
- D4: Legacy `data/store.ts`,`db.ts`,`demo.ts`,`backend.ts` removed only in Phase 6 after
  the portal is validated; `data/repo.ts` (`BusinessRuleError` + local-mode `userRepo`)
  retained.
- D5: Host — evaluate TanStack Start Netlify SSR adapter vs Node server in Phase 2;
  carry over security headers + SPA fallback semantics.

### Open questions / to verify

- ~~Exact TanStack Start + Router versions compatible with React 18.3~~ **RESOLVED
  (2026-08-29):** `@tanstack/react-start@1.168.49` peers = **Vite `>=7`**, React
  `>=18` (18.3.1 OK — no React upgrade), `@tanstack/react-router@1.170.32` React `>=18`.
  **Implication:** adopting Start forces **Vite 5.4 → 7** and transitively **Vitest 2 → 3**
  (Vite 7 peer). These are major-version build-tool upgrades beyond the literal
  framework swap.
- Hosting fork: TanStack Start default output is an **SSR/Nitro Node server**
  (`.output/server/index.mjs`), not a static bundle → changes Netlify from static-SPA
  to an SSR function/server deploy. Alternative: TanStack Start **SPA mode**
  (`tanstackStart({ spa: { enabled: true } })`) or global `defaultSsr:false` keeps a
  static client build (lower risk, but forgoes public-page SSR/SEO).
- Selective SSR confirmed available: per-route `ssr:false` (client-only) for `/app/*`;
  `ssr:true`/default for public pages. `createStart({ defaultSsr })` for global default.

### CHECKPOINT — user decisions confirmed (2026-08-29)

1. ✅ **Upgrade Vite 5→7 + Vitest 2→3** and use the latest TanStack Start.
2. ✅ **Full SSR**: SSR public marketing/blog pages; `/app/*` portal client-only
   (`ssr:false`). Deploy as SSR server; carry over Netlify security headers.
3. ✅ **Proceed autonomously** through Phases 2–6, committing per module.

## 2026-08-29 — Phases 2–5 complete (infra + routing + port)

Dependencies (clean install; Vite 7 matrix): **vite 7.3.6, @tanstack/react-start
1.168.49, @tanstack/react-router 1.170.32, vitest 3.2.7**, @vitest/coverage-v8 3.2.7,
@vitejs/plugin-react 4.7.0 (supports Vite 7). `react-router-dom` still present until
its removal is confirmed unused (see below). Devtools/router-plugin NOT added
(route generation handled by the `tanstackStart()` vite plugin).

Infrastructure:

- `vite.config.ts` → `tanstackStart()` + `viteReact()`, `@`→`src` alias preserved.
- `package.json` scripts → `dev: vite dev`, `build: vite build`, `start: node
.output/server/index.mjs`, `preview`, `typecheck`.
- `src/router.tsx` — `getRouter()` creates a per-request QueryClient in router context.
- `src/routes/__root.tsx` — document (`HeadContent`/`Scripts`), SEO head ported from
  the old `index.html`, providers (QueryClient→Auth→Toast→Confirm), client-only
  `ensureDb()` for local-mode fallback.
- Removed old entry points `index.html`, `src/main.tsx`, `src/App.tsx` (replaced;
  recoverable via git on this branch).

Routing (all URLs preserved): public `routes/index.tsx` (SSR), `blog/index.tsx`,
`blog/$slug.tsx`, `login.tsx`+`signup.tsx` (307 → `/`); portal `app/route.tsx`
(`ssr:false` gate + AppShell) with index + 12 child routes incl.
`deliveries/$id.print.tsx`, `invoices/$id.print.tsx`.

Ported 13 files off `react-router-dom` → `@tanstack/react-router`:

- Link import swaps (SiteLayout, BlogList, DashboardPage, DeliveriesPage).
- `NavLink` → `Link` + `activeProps`/`inactiveProps`/`activeOptions` (AppShell, ×3).
- `useNavigate` → `navigate({ to, params })` (AuthForm, print pages, Invoices,
  Deliveries). `useParams()` → `useParams({ strict:false })` (print pages, BlogPost).
  `Navigate`/`useLocation` re-imported from TanStack. Dynamic links use
  `to="/x/$id" params={{id}}`. `NavItem.to`/Kpi/ListHeader typed `LinkProps['to']`.

Dropped the old `App.tsx` Portal store-hydration gate (`hydrateFromRemote` +
`setSyncErrorHandler`): pages read Supabase via TanStack Query; the local store is
unused for reads, so there is nothing to hydrate. This removed the biggest SSR risk.

Validation at this checkpoint — **all green**:

- `tsc --noEmit` ✓ · `eslint .` ✓ (0 errors, 8 pre-existing warnings) ·
  `vitest run` 17/17 ✓ · `vite build` (SSR) ✓ (dist/client + dist/server).
- Dev server (Vite 7) runs; SSR verified via curl (landing + blog server-rendered),
  `/login` → 307 `/`, `/app` serves client shell. Browser: landing + blog render
  identically, client nav works, `useSeo` title updates, **no hydration/console errors**.

Remaining (Phase 6): Playwright e2e (update config for Start server), full feature
parity walkthrough (authenticated portal), then confirm/remove `react-router-dom`
and any now-dead legacy `data/*` modules; update netlify/hosting for SSR.

### Next

- Phase 2: scaffold TanStack Start infra alongside the working Vite app (non-breaking),
  then migrate root/providers (Phase 3), routes (Phase 4), port usages (Phase 5),
  validate + cleanup (Phase 6).
