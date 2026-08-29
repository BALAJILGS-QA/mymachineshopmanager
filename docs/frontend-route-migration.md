# Frontend Route Migration Map

Old (`react-router-dom` in `src/App.tsx`) → New (TanStack Router file routes under
`src/routes/`). **No route silently disappeared.** `Status` = code migrated (all ✅);
`Tested` = verified in Phase 6.

Legend: ✅ done · — n/a

Tested how: **e2e** = Playwright (`site.spec`/`supabase.spec`/`portal-nav.spec`),
**probe** = curl against the SSR preview build.

## Public (SSR)

| Old Route     | New Route (file)                        | SSR | Status | Tested            |
| ------------- | --------------------------------------- | --- | ------ | ----------------- |
| `/`           | `routes/index.tsx` → LandingPage        | yes | ✅     | ✅ e2e + browser  |
| `/blog`       | `routes/blog/index.tsx` → BlogListPage  | yes | ✅     | ✅ e2e + browser  |
| `/blog/:slug` | `routes/blog/$slug.tsx` → BlogPostPage  | yes | ✅     | ✅ e2e (nav→post) |
| `/login`      | `routes/login.tsx` → redirect `/`       | —   | ✅     | ✅ probe (307→/)  |
| `/signup`     | `routes/signup.tsx` → redirect `/`      | —   | ✅     | ✅ probe (307→/)  |
| `*` (unknown) | root `notFoundComponent` → `Navigate /` | —   | ✅     | ✅ probe¹         |

¹ Unknown URLs return HTTP 404 and client-redirect to `/` after hydration (old static
SPA returned 200 then redirected; visible outcome identical, status code differs).

## Authenticated portal `/app/*` (client-only, `ssr:false`)

Wrapped by `routes/app/route.tsx` (auth gate + `AppShell`; the old store-hydration
step was dropped — pages read Supabase via TanStack Query).

| Old Route                   | New Route (file)                          | Status | Tested                 |
| --------------------------- | ----------------------------------------- | ------ | ---------------------- |
| `/app` (index)              | `routes/app/index.tsx` → DashboardPage    | ✅     | ✅ e2e (login→shell)   |
| `/app/jobs`                 | `routes/app/jobs.tsx`                     | ✅     | ✅ e2e nav             |
| `/app/production`           | `routes/app/production.tsx`               | ✅     | ✅ e2e nav             |
| `/app/materials`            | `routes/app/materials.tsx`                | ✅     | ✅ e2e nav             |
| `/app/deliveries`           | `routes/app/deliveries/index.tsx`         | ✅     | ✅ e2e nav             |
| `/app/deliveries/:id/print` | `routes/app/deliveries/$id.print.tsx`     | ✅     | ✅ probe (200 shell)   |
| `/app/invoices`             | `routes/app/invoices/index.tsx`           | ✅     | ✅ e2e nav             |
| `/app/invoices/:id/print`   | `routes/app/invoices/$id.print.tsx`       | ✅     | ✅ probe (200 shell)   |
| `/app/payments`             | `routes/app/payments.tsx`                 | ✅     | ✅ e2e nav             |
| `/app/expenses`             | `routes/app/expenses.tsx`                 | ✅     | ✅ e2e nav             |
| `/app/reports`              | `routes/app/reports.tsx`                  | ✅     | ✅ e2e nav             |
| `/app/companies`            | `routes/app/companies.tsx`                | ✅     | ✅ e2e (create/delete) |
| `/app/approvals`            | `routes/app/approvals.tsx` (SuperAdmin)   | ✅     | ✅ e2e nav             |
| `/app/settings`             | `routes/app/settings.tsx`                 | ✅     | ✅ e2e nav             |
| `/app/*` (unknown)          | app `notFoundComponent` → `Navigate /app` | ✅     | ✅ probe               |

All portal routes are exercised by `e2e/portal-nav.spec.ts` (super-admin login →
navigate each sidebar route → assert `<h1>` + shell survive) plus a direct deep-link;
Companies additionally does a full create/delete Supabase round-trip (`supabase.spec`).
Deeper per-page CRUD/print/export click-throughs remain a nice-to-have but are not
required for the migration (feature pages are byte-for-byte unchanged).

## Param-name mapping

- react-router `:id` → TanStack `$id` (`useParams({ strict: false }).id`).
- react-router `:slug` → TanStack `$slug` (`useParams({ strict: false }).slug`).

## Deep-link / bookmark guarantees

`/app/deliveries/<id>/print` and `/app/invoices/<id>/print` load directly (probed 200);
they render client-side behind the auth gate, exactly as before.
