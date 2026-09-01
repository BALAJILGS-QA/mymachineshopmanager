# CLEANUP_PLAN.md — retiring Vite + TanStack Start/Router (Phase 7)

> Gate check (§36) before deletion — all satisfied on `dev`:
> ✅ all 28 routes migrated & verified (ROUTE_MIGRATION_MAP.md) · ✅ e2e suite at exact parity with the Vite baseline (9F/9P/4S, failures pre-existing/environmental) · ✅ production build passes (`next build`, 30 pages) · ✅ auth verified end-to-end (login/logout/guard) · ✅ Supabase verified (live data) · ✅ PDFs (challan print verified; invoice print same pattern) · ✅ charts (dashboard verified) · ✅ critical workflows (companies CRUD, deliveries list+print, dashboard KPIs) verified via authenticated Playwright.
> Safety: cleanup lands on `dev` only; production (`main`) still runs the pre-migration build until merge. Single-commit revert restores the dual-stack state.

## Deleted

| Item                                                                       | Reason                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/**` (28 files), `src/router.tsx`, `src/routeTree.gen.ts`       | TanStack route tree — Next App Router (`app/`) is the router now.                                                                     |
| `vite.config.ts`                                                           | Vite no longer builds the app.                                                                                                        |
| `src/features/site/{SiteLayout,LandingPage,BlogListPage,BlogPostPage}.tsx` | Vite-only site pages; Next serves `app/page.tsx`, `app/blog/**` (which reuse `blogData.ts`, `useReveal.ts`, `site.css` — those stay). |
| `src/components/layout/AppShell.tsx`                                       | Vite shell; Next shell lives at `app/_shell/app-shell.tsx`.                                                                           |
| `src/components/nav/tanstack-app-link.tsx`                                 | TanStack adapter for AppLink/nav bridge.                                                                                              |
| `playwright.next.config.ts`                                                | Its content becomes the default `playwright.config.ts`.                                                                               |
| `tsconfig.next.json`, `tsconfig.node.json`                                 | Root `tsconfig.json` unified to the Next-style config.                                                                                |

## Dependencies removed

`@tanstack/react-router`, `@tanstack/react-start`, `vite`, `@vitejs/plugin-react`, `eslint-plugin-react-refresh` (Vite fast-refresh lint). **Kept:** `@tanstack/react-query` (per §11 — the data layer), `vitest` (bundles its own vite internally).

## Changed

- `package.json` scripts: `dev`/`build`/`start` → `next dev`/`next build`/`next start`; `test:e2e` targets the Next server; `test:e2e:next` removed.
- `playwright.config.ts` → the former Next config (port 3200, `next build && next start`).
- Root `tsconfig.json` → Next-style (`jsx: preserve`, next plugin, includes `app` + `next-env.d.ts`); `next.config.mjs` drops `typescript.tsconfigPath`.
- `src/components/layout/nav.ts` → `to: string` (drops the type-only TanStack import).
- `tailwind.config.js` content: drop `./index.html` (no longer exists).
- `eslint.config.js`: drop react-refresh plugin (Vite-only) and vite config ignores.
- `netlify.toml` → Next runtime (`@netlify/plugin-nextjs`).
- `vercel.json` → `framework: nextjs` only (`npm run build` now IS `next build`).
- `CLAUDE.md` → commands/architecture updated for the Next-only world.

## Kept (deliberately)

- `src/lib/env-public.ts` + the `VITE_*→NEXT_PUBLIC_*` bridge in `next.config.mjs` — until the hosting env vars are renamed to `NEXT_PUBLIC_*` (then delete both).
- `src/lib/seo.ts` — `applyAppSeo`/`applyFavicon` used by the Next shell (`useSeo` now unused; prune later).
- `src/features/site/{blogData.ts,useReveal.ts,site.css}` — consumed by the Next site pages.
- Legacy local-mode data layer (`src/data/{store,db,demo,seed,backend}.ts`) — pre-existing scope, untouched per the audit.

## Post-cleanup verification (must all pass before commit)

`tsc --noEmit` · `vitest run` (26) · `next build` · full Playwright suite on the default config · `eslint .` 0 errors · authenticated smoke (login → dashboard → companies) on `next start`.

## Remaining after this phase (tracked)

- Rename hosting env vars to `NEXT_PUBLIC_*`, then delete the env bridge + `env-public.ts` fallback path.
- Progressive RHF+Zod for the remaining forms (see Phase 6 table in MIGRATION_PROGRESS.md).
- DataTable rollout to the remaining list pages.
- README refresh; delete `netlify.toml` if Netlify is retired; prune `useSeo` from `seo.ts`.
