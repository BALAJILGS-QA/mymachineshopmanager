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

- Exact TanStack Start + Router versions compatible with React 18.3 (verify via context7
  before adding deps).
- Netlify SSR target vs. keeping a static client build with Router in SPA mode.

### Next

- Phase 2: scaffold TanStack Start infra alongside the working Vite app (non-breaking),
  then migrate root/providers (Phase 3), routes (Phase 4), port usages (Phase 5),
  validate + cleanup (Phase 6).
