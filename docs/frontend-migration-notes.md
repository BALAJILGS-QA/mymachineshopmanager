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

## 2026-08-29 — Phase 6: Validation + cleanup

Serving: the default Start build emits an SSR **handler** at `dist/server/server.js`
(no standalone listener; the `target:'node-server'` plugin option was a no-op in
1.168 and was reverted). `vite preview` serves the SSR build correctly (public pages
server-rendered, `/app` client-only), so `start`/`preview` and the Playwright
webServer all use `vite preview`. **Production host wiring (Netlify/Vercel/Node
adapter) is the one remaining manual deployment step** — see architecture doc.

E2E (Playwright, chromium, against the SSR preview build):

- `site.spec` — **2/3 pass**: blog SSR list→post nav + `route-jsonld` ✓, robots/
  sitemap ✓. The 1 failure is `toHaveTitle(/Sree Balaji Industries/)` — **pre-existing
  and NOT a regression**: `BRAND.product` is `'Machine Shop Management'` on `main` too,
  so the landing title was already "Machine Shop Management — …". Stale assertion from
  before a brand rename; app behavior unchanged, so left as-is (fixing it would be a
  non-migration content change).
- `supabase.spec` — **PASS**: authenticated full round-trip — Supabase login → `ssr:false`
  app gate → AppShell → Companies route → create (mutation→Supabase) → clear local
  cache + reload → re-hydrate from cloud → delete. Validates the portal migration.
- Not run (data-dependent / mode-mismatch, unrelated to migration): `dashboard.spec`
  (needs the imported seed data that was wiped earlier), `smoke.spec` (local-mode suite;
  this build is Supabase mode).

Cleanup:

- Removed `react-router-dom` (0 refs remain); typecheck/build stay green.
- Kept `data/store`+`db`+`backend`+`seed` (local-mode `ensureDb` fallback via `__root`).
  `data/demo.ts` was already dead pre-migration; left untouched (out of scope).

Final gate — **all green**: `tsc` ✓ · `eslint` ✓ (0 errors) · `vitest` 17/17 ✓ ·
`vite build` (SSR) ✓ · e2e migration-relevant ✓ · browser hydration clean.

### Remaining manual step (deployment)

Wire the production SSR host: add the TanStack Start Netlify (or Vercel/Node) adapter
and update `netlify.toml` (drop the `/*→/index.html` SPA fallback; keep the security
headers). Left un-guessed because the 1.168 preset API didn't match the docs on hand.

## 2026-08-29 — Phase 6 (cont.): full e2e green

Added `e2e/portal-nav.spec.ts` (logs in as super admin, visits **all 12** `/app`
routes via the sidebar asserting each renders an `<h1>` + the shell survives, plus a
direct deep-link). Nav links are matched by `href` (labels can carry a badge, e.g. the
Approvals item shows "User Approvals 1" when a registration is pending).

**Debugging a false failure — stale preview server (important):** after several rebuilds,
login e2e began failing — the form did a _native GET submit_ (creds landed in the URL)
because the page never hydrated: every `/assets/*.js` chunk 404'd. Root cause: a
**leftover `vite preview` process from an earlier build was still bound to :4173**, and
git-bash `pkill` does not kill Windows `node.exe`, so Playwright's `reuseExistingServer`
kept reusing the stale server whose HTML referenced asset hashes no longer on disk. Fix:
kill by port via PowerShell (`Get-NetTCPConnection -LocalPort 4173 | Stop-Process`). Not
a migration bug. **Lesson: on Windows, free the e2e port via PowerShell between manual
preview runs**, or set `reuseExistingServer:false`.

Fixed 3 **stale assertions** in the pre-existing `site.spec` landing test (it was fully
RED on `main` — predates a site-copy + brand rename): title `Sree Balaji Industries`→
`Machine Shop Management`, hero `tolerance`→`traceability`, desc `CNC`→`machine shop`,
keywords `machining`→`CNC` — aligned to the actual (migration-unchanged) `BRAND.*` copy.

**Final e2e (Playwright): ALL GREEN.**

- chromium: `site.spec` 3/3, `supabase.spec` 1/1 (auth round-trip), `portal-nav.spec`
  2/2 (all 12 routes + deep-link) = **6/6**.
- mobile (Pixel 7): `site.spec` 3/3; portal/auth specs correctly skip (desktop-only).
- `dashboard.spec`/`smoke.spec` still excluded (seed-data + local-mode; unrelated).

Every portal route now has direct e2e evidence — the ⚠️ rows in route-migration /
feature-parity are upgraded to ✅.
