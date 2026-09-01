# MIGRATION_PROGRESS.md — phase completion log

Tracks each independently-verifiable migration stage. See `MIGRATION_AUDIT.md`,
`MIGRATION_BASELINE.md`, `ROUTE_MIGRATION_MAP.md`, `UI_MIGRATION_MAP.md` for detail.

---

## ✅ Phase 2 — Next.js foundation (COMPLETE)

**Goal:** Stand up Next.js App Router alongside the existing Vite + TanStack app,
both building in parallel. No routes migrated, nothing removed.

### Key decision — versions

- Installed **Next.js 16.3.4** (latest stable) and **kept React 18.3.1** — `next@16`
  peer range is `react: ^18.2.0 || ^19.0.0`, and TanStack peers are `react >=18`,
  so **no React upgrade was needed**. This eliminates the audit's top risk (a React
  major bump destabilising the still-running TanStack app during the parallel phase).

### What was added (all additive)

| File                    | Purpose                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `app/layout.tsx`        | Root layout (Server Component); SEO metadata mirrors `src/routes/__root.tsx`.                                                       |
| `app/providers.tsx`     | `"use client"` — TanStack Query provider; QueryClient defaults mirror `src/router.tsx` (staleTime 30 000, no refetch-on-focus).     |
| `app/page.tsx`          | Temporary SSR home that proves the pipeline; replaced by the real landing in the route phase.                                       |
| `app/globals.css`       | Tailwind directives (proves Tailwind 3 + PostCSS under Next).                                                                       |
| `next.config.mjs`       | `reactStrictMode`; `typescript.tsconfigPath → tsconfig.next.json`.                                                                  |
| `tsconfig.next.json`    | Next-only TS config (`jsx: preserve` + next plugin), **extends** root; scoped `include: [app, next-env.d.ts, .next/types]`.         |
| `src/lib/env-public.ts` | Cross-runtime public env shim (reads `VITE_*` via Vite or `NEXT_PUBLIC_*` via Next). Additive; wired into `supabase.ts` in Phase 3. |

### What was changed (minimal, non-breaking)

- `package.json` — added parallel scripts `dev:next` / `build:next` / `start:next`. **Vite's `dev`/`build`/`start` are untouched and remain primary**, so current Vercel/Netlify deploys are unaffected.
- `tailwind.config.js` — `content` now also scans `./app/**/*.{ts,tsx}` (additive).
- `.gitignore` — ignore `.next` + `next-env.d.ts`.
- `eslint.config.js` — ignore generated output (`.next`, `next-env.d.ts`, `.output`, `.tanstack`).
- `.env.example` — documented `NEXT_PUBLIC_SUPABASE_*` alongside `VITE_SUPABASE_*`.

### What was deliberately NOT touched

- Root `tsconfig.json` (byte-identical to baseline — Vite/`tsc`/Vitest use it).
- All of `src/**` application/business code (auth, data layer, features, computations).
- `vite.config.ts`, `vercel.json`, `netlify.toml`, `playwright.config.ts`, `vitest.config.ts`.
- React / react-dom versions.

### Verification (all green)

| Check                     | Command                              | Result                                          |
| ------------------------- | ------------------------------------ | ----------------------------------------------- |
| Vite typecheck            | `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0                                       |
| Unit tests                | `npm run test` (Vitest)              | ✅ 26/26                                        |
| Vite build (SSR)          | `npx vite build`                     | ✅                                              |
| Vite build (SPA / Vercel) | `SPA=1 npx vite build`               | ✅ (prerendered `/`)                            |
| Next build                | `npm run build:next`                 | ✅ clean, no warnings                           |
| Next serves SSR           | `next start` + curl `/`              | ✅ HTTP 200, expected HTML rendered             |
| Lint                      | `npm run lint`                       | ✅ 0 errors (10 pre-existing/expected warnings) |

**Baseline preserved:** typecheck, unit tests, and both Vite build modes behave
exactly as recorded in `MIGRATION_BASELINE.md`. Any regression is therefore a
Phase 3+ change, not Phase 2.

### How to run both apps during the parallel phase

- Existing app (primary today): `npm run dev` (Vite, :5173) · `npm run build` (deployed).
- New Next app: `npm run dev:next` (:3000) · `npm run build:next` → `npm run start:next`.

### Rollback

Phase 2 is fully additive. To revert: delete `app/`, `next.config.mjs`,
`tsconfig.next.json`, `src/lib/env-public.ts`; revert the small edits to
`package.json`, `tailwind.config.js`, `.gitignore`, `eslint.config.js`,
`.env.example`; `npm remove next`. The existing app is unaffected either way.

---

## 🚧 Phase 3 — routing migration (IN PROGRESS)

Migrating routes onto Next.js one increment at a time, public → auth shell →
portal, per `ROUTE_MIGRATION_MAP.md`. The Vite/TanStack routes stay live until
each Next equivalent is verified.

### Increment 3.1 — public content routes + compat redirects (DONE)

Migrated (Next now serves these; Vite still serves its copies in parallel):

| Route          | Next file                  | Notes                                                                                                                                                                     |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/blog`        | `app/blog/page.tsx`        | Server Component; SSR content; SEO via Metadata API; JSON-LD (`Blog`).                                                                                                    |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx` | **SSG** via `generateStaticParams` (all 5 posts); per-post `generateMetadata`; JSON-LD (`BlogPosting`); unknown slug → `redirect('/blog')` (preserves Vite `<Navigate>`). |
| `/login`       | `app/login/page.tsx`       | `redirect('/')` (307) — preserves compat URL.                                                                                                                             |
| `/signup`      | `app/signup/page.tsx`      | `redirect('/')` (307) — preserves compat URL.                                                                                                                             |

Supporting (no logic duplicated — pure modules reused from `src`):

- `app/_site/site-chrome.tsx` — Next port of `SiteLayout` (client); markup 1:1, only `Link to` → `next/link href`. Reuses `Logo`, `BRAND`, `site.css`, `useReveal`.
- `app/_site/json-ld.tsx` — XSS-safe JSON-LD (escaped text children, no raw-HTML API).
- `src/lib/site-meta.ts` — **new pure module** holding `SITE_NAME/BASE_URL/DEFAULT_IMAGE/SITE`; `src/lib/seo.ts` now re-exports `SITE` from it. Needed because `seo.ts` imports `useEffect` (client-only) and can't be pulled into a Server Component. Vite behaviour unchanged.
- `app/globals.css` — added Google Fonts (`Saira`/`IBM Plex`/`Inter`) to match the Vite site typography.

Verification (all green): `next build` ✓ (11 pages, 5 blog posts SSG'd) · runtime `next start` → `/blog` 200, `/blog/:slug` 200, `/login` 307→`/`, unknown slug 307→`/blog` · Vite `tsc` ✓ · Vitest 26/26 ✓ · Vite SPA build ✓ · lint 0 errors.

URL parity preserved; `blogData.ts` remains the single source of blog content.

### Increment 3.2 — landing `/` + authentication (DONE)

Migrated the landing and wired Supabase auth under Next.

| Route | Next file      | Notes                                                                                                     |
| ----- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `/`   | `app/page.tsx` | Server Component; SSR marketing + Metadata API + `SoftwareApplication` JSON-LD; replaces the placeholder. |

Auth wiring:

- `src/data/supabase.ts` now reads env via `src/lib/env-public.ts` (the shim). **Fix:** the shim uses **static** `import.meta.env.VITE_*` / `process.env.NEXT_PUBLIC_*` reads — bundlers only inline static references, so the earlier dynamic keys left the Next **client** in local mode (caught in-browser: the superadmin hint showed). Static reads put both Vite and Next clients in Supabase mode.
- `.env`: added `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same values as `VITE_*`).
- `AuthForm` is now **router-agnostic**: the two `navigate({to:'/app'})` calls became an injected `onAuthenticated` callback. Vite `LandingPage` passes `() => navigate({to:'/app'})`; Next passes `() => router.push('/app')` via `app/_site/landing-auth.tsx` (client island).
- `app/providers.tsx`: added `AuthProvider` + `ToastProvider` (SSR-safe with Supabase configured).
- `app/page.tsx` imports `@/index.css` for the `.input`/`.btn-primary` classes `AuthForm` needs.

Verification: `next build` ✓; Supabase URL inlined in the **client** bundle (Supabase mode confirmed in-browser — Email field, no superadmin hint); Next landing pixel-parity with Vite. **Vite app re-verified in browser: login/session/dashboard all work.** Vite `tsc` ✓, Vitest 26/26 ✓, Vite SPA build ✓ (GoTrue configured), lint 0 errors.

**Known interim gap:** the Next landing's `onAuthenticated` pushes to `/app`, not yet migrated to Next → 404 on the Next app until increment 3.3. The **live Vite app is unaffected** and fully works.

### Increment 3.3 — authenticated portal shell + dashboard (DONE, login-render pending)

Stood up the `/app` portal in Next so the login→dashboard loop now completes end-to-end.

| Route                    | Next file            | Notes                                                                                                                                                                          |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/app/*` (shell + guard) | `app/app/layout.tsx` | Client layout mirroring `src/routes/app/route.tsx` (`ssr:false`): `useAuth` guard → `router.replace('/')` when no session; wraps the ported `AppShell`; imports `@/index.css`. |
| `/app` (dashboard)       | `app/app/page.tsx`   | Client page rendering the reused `DashboardPage` (recharts).                                                                                                                   |

Key change — **navigation abstraction** (avoids duplicating shared pages):

- `src/components/nav/app-link.tsx` — neutral `AppLink` + `AppLinkProvider` context (no router import).
- `src/components/nav/tanstack-app-link.tsx` (Vite adapter) provided in `src/routes/__root.tsx`; `app/_shell/next-app-link.tsx` (next/link adapter) provided in `app/providers.tsx`.
- `DashboardPage` now uses `<AppLink>` instead of TanStack `Link` (its only router coupling). `LinkProps['to']` → `string`. Works under both apps.
- `AppShell` ported to `app/_shell/app-shell.tsx` — `next/link` + `usePathname()` with active states computed inline (`isLinkActive`); `nav.ts` reused (only a type-only TanStack import).

Verification: `next build` ✓ (12 routes incl. `/app`); **Next `/app` guard verified in-browser (unauthenticated → redirect to `/`)**; Next landing post-login now targets a real Next `/app`. Vite app re-verified in-browser (landing renders — `__root` AppLinkProvider change safe). Vite `tsc` ✓, Vitest 26/26 ✓, lint 0 errors.

**Pending visual check (not a blocker):** the authenticated shell + dashboard _render_ (both Vite dashboard after the AppLink change, and the Next portal) needs a login to see. I could not perform it — the session had expired and typing passwords via browser automation is disallowed by policy. Build + typecheck + guard are green and the components are faithful ports; recommend a quick manual login on `:5173` (Vite) and `:3000` (Next) to confirm the dashboard renders.

### Increment 3.4 — ALL remaining portal routes + hub redirects (DONE) ✅

**Phase 3 (routing) is complete — Next.js now serves every URL of the application.**

Migrated in this increment (all verified with an authenticated Playwright session):

- 14 simple portal pages: jobs, production, materials, sales, expenses, deliveries, invoices, payments, vendors, subcontracting, companies, approvals, reports, settings — each a thin `'use client'` wrapper reusing the shared feature page.
- 2 dynamic print routes: `deliveries/[id]/print`, `invoices/[id]/print` (client; jsPDF; `id` injected via next/navigation `useParams`).
- 4 hub redirects: production-planning→jobs, accounts→expenses, supply-chain→vendors, configuration→companies (server `redirect()`; embedded as NEXT_REDIRECT under the client layout — client-side execution, parity with the old `ssr:false` behaviour).
- 2 catch-alls preserving old notFound behaviour: `app/[...rest]`→`/` (307), `app/app/[...rest]`→`/app`.

Nav abstraction completed (no duplicated business pages):

- `useAppNavigate()` added to `src/components/nav/app-link.tsx` (+ `TanStackNavBridge` / `NextNavBridge` adapters wired in both roots).
- De-coupled the last 5 TanStack-importing feature files: `DeliveriesPage` (Link+navigate), `InvoicesPage` (navigate), `ChallanPrintPage` + `InvoicePrintPage` (useParams→`id` prop + navigate; Vite route wrappers now pass `Route.useParams()`), `ApprovalsPage` (`<Navigate>`→effect redirect).
- `ConfirmProvider` added to Next providers (SSR-safe; Modal touches DOM only in effects).
- `src/features/**` now has ZERO `@tanstack/react-router` imports (site/* pages excepted — Vite-only by design).

Verification (all green): Vite `tsc` ✓ · Vitest 26/26 ✓ · Vite SPA build ✓ · `next build` ✓ (26 routes) · lint 0 errors · **authenticated Playwright sweep on Next**: dashboard, jobs, materials, deliveries (15-row table, real data), challan print (full document via row click → param injection), reports, approvals (super-admin), settings — **0 console errors on every route** (prefetch 404s gone) · hub redirects + catch-alls verified · **Vite parity re-verified**: deliveries → print click-through works identically.

## ✅ Phase 4 — E2E repoint + Vercel cutover config (COMPLETE)

### 4a — E2E suite repointed to Next

- `playwright.next.config.ts` + `npm run test:e2e:next` — runs the SAME 10 specs against `next build && next start` (port 3200). The original Vite harness (`npm run test:e2e`) is untouched until cleanup.
- **Parity bug found & fixed:** site.spec asserts `script#route-jsonld`; the Next `JsonLd` component lacked the `id`. Added (identical to Vite's `useSeo`) — site.spec 3/3 ✓.
- **Full-suite verdict: EXACT PARITY.** Next: 9 failed / 9 passed / 4 skipped — identical, spec-for-spec, to the Vite baseline (the 9 failures are the environmental auth-gated specs that fail the same way on the pre-migration base commit; they pass when login is driven manually).

### 4b — Vercel cutover config (staged, safe)

- `vercel.json` → `framework: "nextjs"`, `buildCommand: "npx next build"` (explicit because `npm run build` is still Vite until cleanup). Removed: SPA `outputDirectory`, the `/_shell.html` rewrite, and the Vite `/assets/` cache rule (Next handles `/_next/static` immutability itself).
- Security headers moved to `next.config.mjs` `headers()` so they apply on ANY host (verified live on `next start`: X-Frame-Options DENY, nosniff, Referrer-Policy).
- **Env bridge:** `next.config.mjs` `env` maps `VITE_SUPABASE_*` → `NEXT_PUBLIC_SUPABASE_*` at build time — Vercel's existing env vars work for the Next build with NO dashboard changes (CLI is logged out; nothing needed). Verified: Supabase URL inlined in the client bundle. Remove the bridge at cleanup once hosting env is renamed.

### Cutover mechanics (IMPORTANT)

- Pushing `dev` → Vercel builds a **preview** deployment with the Next config — production (`main`) still serves the old SPA build.
- **Production flips to Next.js only when `dev` is merged to `main`** (config + code travel together — atomic cutover). Verify the preview URL first.
- Netlify (`netlify.toml`) still builds the Vite SSR app — decide at cleanup whether to retire or repoint it.

## 🚧 Phase 5 — premium design system (IN PROGRESS)

### Increment 5.1 — shadcn foundation + industrial rebrand (DONE)

**shadcn/ui scaffolding** (manual init — deterministic diff, CLI-ready):

- deps: `tailwind-merge`, `class-variance-authority`, `tailwindcss-animate`.
- `components.json` (style new-york; ui alias → `@/components/ui/shadcn` so generated components never collide with the existing hand-written `ui/*`).
- `src/lib/utils.ts` — canonical `cn()`.
- shadcn theme tokens (HSL vars) in `src/index.css` `:root` + canonical token colours (`border/input/ring/background/primary/…`) and `tailwindcss-animate` in `tailwind.config.js`. `--primary` = industrial orange; light theme.

**MSM rebrand — white + charcoal + industrial orange (§16), one central token swap:**

- `brand.*` Tailwind scale: apple-green → industrial orange (50 `#fff7ed` … 900 `#7c2d12`; action = 600 `#ea580c`). Every existing `brand-*` class (buttons, active nav, focus rings, KPI tints) rebrands automatically. New `charcoal.*` scale for navigation surfaces.
- `src/index.css`: `--brand/--brand-hover/--brand-soft` → orange; `--ink` → charcoal `#1f2430`; gradient/ring utilities → orange.
- **Charcoal sidebar** in BOTH shells (Next `app/_shell/app-shell.tsx` + Vite `AppShell.tsx`): `bg-charcoal-900` rail + mobile drawer, white brand text, `text-charcoal-100/70` inactive links, orange active state (15% orange tint + `text-brand-400` + orange left bar). Top bar/workspace stay white (orange must not dominate).
- Marketing site (`site.css`): green palette → warm neutrals + orange accents (`--amber #c2410c`, buttons orange-gradient/white text, blueprint grid + glows re-tinted).
- `Logo.tsx`: tile gradient → orange (`#fb923c→#ea580c→#7c2d12`), tooling edge → charcoal.
- Dashboard chart colours (PIE/Bar greens → orange family), `theme-color` meta `#ea580c` (both roots), AuthForm glow lime→orange.

Verification: Vite `tsc` ✓ · Vite build ✓ · `next build` ✓ (30 pages) · site.spec 3/3 on rebranded build ✓ · **rebranded dashboard verified in-browser (authenticated)**: charcoal rail + orange active nav + white workspace + orange chart accents, 0 console errors.

### Increment 5.2 — shadcn primitives in the repo (DONE)

- `npx shadcn add button input label textarea badge card skeleton separator` → 8 canonical new-york components in `src/components/ui/shadcn/` (per the components.json alias — no collision with hand-written `ui/*`). New deps: `@radix-ui/react-label`, `-separator`, `-slot`.
- All components consume the Phase-5.1 tokens (`bg-primary` = industrial orange, `border-input`, `ring-ring`).
- First delegation proven: `common/Skeleton.tsx` now renders the shadcn Skeleton internally (API unchanged, all call sites untouched).
- **Deliberate scope decision (behaviour preservation, §14/§18):** the existing native `Input`/`Select`/`Textarea` primitives and `.btn-*`/`.input` classes stay as-is for now — they already carry the rebranded tokens, and the native `<select>` API (13 files) must not silently become Radix Select outside the forms phase. shadcn components are the base for NEW design-system components (5.3/5.4) and the RHF forms (Phase 6).

Verified: tsc ✓, next build ✓, Vite build ✓, lint 0 errors.

### Remaining Phase 5 increments (per UI_MIGRATION_MAP.md)

- 5.3 overlays: Dialog (Modal), AlertDialog (ConfirmDialog, keep `useConfirm`), Sonner (keep `useToast`), Popover+Calendar (DateInput), Command multi-select.
- 5.4 shared DataTable + ERP components (PageHeader/FilterBar/StatusBadge/SummaryCard…), module-by-module rollout.
- 5.5 accessibility + polish pass.

### Next phases

- **Phase 4 (per master plan): deployment cutover decision + E2E repoint** — point `playwright.config.ts` at the Next server, run the full suite, then flip Vercel to the Next build.
- **Phase 5+: shadcn/Radix design system + rebrand, RHF+Zod forms, cleanup (remove Vite/TanStack per CLEANUP_PLAN).**
