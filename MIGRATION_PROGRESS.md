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

### Increment 3.2 — landing `/` + auth — NEXT

Bigger: the landing embeds the Sign In/Sign Up form (`AuthForm` → `useAuth` → Supabase). Requires porting `AuthProvider` + `LandingPage` under Next and wiring `src/data/supabase.ts` to the `env-public.ts` shim (so `NEXT_PUBLIC_*` works). Replaces the Phase-2 placeholder at `/`.

### Remaining

Authenticated portal shell (`/app`) + all portal module routes + hub redirects — see `ROUTE_MIGRATION_MAP.md`.
