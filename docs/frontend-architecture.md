# Frontend Architecture (Target — TanStack Start)

Describes the target architecture after migration. Reflects the constraint that the
data layer is **already** TanStack Query + Supabase and is carried over unchanged.

## 1. High-level shape

```
Browser
  │
  ├─ Public site (SSR)   /  /blog  /blog/:slug        ← SEO, static-ish marketing
  │     LandingPage (merged login/register), Blog
  │
  └─ App portal (CSR)    /app/*                        ← authenticated single-user tool
        _authenticated gate → AppShell → feature pages
                                   │
                                   ▼
                         TanStack Query (server state)
                                   │
                         feature api/*.ts  (+ lib/api helpers)
                                   │
                         @supabase/supabase-js  → Supabase / PostgreSQL (RLS + RPCs)
```

Backend is authoritative. Client-side role checks (`isSuperAdmin`, approval status)
are **UX only**; RLS + RPCs enforce real security.

## 2. Routing

- **TanStack Router**, file-based under `src/routes/`, type-safe params.
- Public routes are SSR-enabled; `/app/*` routes are client-rendered (`ssr:false` or a
  client-only boundary) to keep localStorage/Supabase-session logic off the server.
- `routes/app/route.tsx` is the protected layout: `beforeLoad`/component checks
  `useAuth().session`, performs Supabase hydration (`hydrateFromRemote`) once, then
  renders `AppShell`. Unauthorized → redirect `/`. Approvals route additionally gates
  on `isSuperAdmin`.
- Param mapping: `:id`→`$id`, `:slug`→`$slug`. No search-param state exists.
- Redirects preserved: `/login`,`/signup` → `/`; unknown `/app/*` → `/app`; unknown → `/`.

## 3. Server state (unchanged)

- TanStack Query `QueryClient` (staleTime 30s, `refetchOnWindowFocus:false`) provided
  at the root. Keys centralized in `lib/api/queryKeys.ts`. Feature hooks in
  `features/<f>/hooks/use<F>.ts` wrap `features/<f>/api/<f>Api.ts`.
- Mutations invalidate affected keys (e.g. `jobs.all` + `stock.all`). No server state is
  duplicated into global stores.

## 4. Client state

- Auth: React Context (`AuthProvider`/`useAuth`) over Supabase Auth session.
- UI: local `useState`, react-hook-form form state, Toast + Confirm providers.
- URL: path params via TanStack Router.

## 5. Authentication & authorization

- Client-side Supabase Auth retained (no new server session cookie, to avoid behavior
  change). Approval-gate + super-admin logic unchanged in `features/auth/auth.tsx`.
- Protected-route gating moves from `App.tsx` `Portal` into the `_authenticated` layout.

## 6. API layer (unchanged)

- Single Supabase client (`data/supabase.ts`), created only when env vars present.
- Per-feature `api/` + shared `lib/api/` (`supabaseCrud`, `rowMap`, `numbering`, `errors`,
  `queryKeys`). Server-side RPCs: `create_job`, `transition_job`, `set_user_approval`.

## 7. SSR usage (deliberately minimal)

- SSR only where it adds value: public marketing/blog (SEO metadata, OG tags, semantic
  HTML, canonical URLs via route `head`).
- The authenticated app is **not** SSR'd (no SEO value; heavy browser APIs). This avoids
  hydration risk and keeps the migration behavior-preserving.

## 8. Error handling

- Query/mutation errors → `lib/api/errors.ts` → Toast. Route-level error boundaries +
  pending components for load states. Not-found components for unknown routes.
- Consistent states: Loading / Empty / Error / Success / Unauthorized (redirect) /
  Not-Found. Raw technical errors are never shown to users.

## 9. Security boundaries

- Only `VITE_`-prefixed public env vars reach the client (`data/supabase.ts`,
  `lib/env.ts`). No secrets in the client bundle or in SSR-exposed context.
- Anon key only; RLS is the authority. Sourcemaps/headers per `netlify.toml`
  (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) carried to the new host.

## 10. Testing strategy

- `tsc --noEmit` (strict), ESLint 9 flat config, Vitest unit (`computations.test.ts`),
  Playwright e2e (smoke, dashboard, site, supabase, import-verify). Phase 6 adds e2e for
  deep links + redirects and a production build/preview smoke.

## 11. Directory layout (target)

```
src/
  routes/              # TanStack Router file routes (NEW)
    __root.tsx
    index.tsx  login.tsx  signup.tsx
    blog/index.tsx  blog/$slug.tsx
    app/route.tsx  app/index.tsx  app/jobs.tsx ... app/settings.tsx
    app/deliveries/$id.print.tsx  app/invoices/$id.print.tsx
  router.tsx           # createRouter (NEW)
  features/            # UNCHANGED (api, hooks, pages, forms)
  components/          # UNCHANGED (ui, common, layout)
  data/                # supabase client + computations kept; legacy store/db removed in Phase 6
  lib/                 # UNCHANGED (api helpers, format, seo, xlsx, ...)
  types/               # UNCHANGED
  styles/index.css     # (from src/index.css)
```
