# Frontend Route Migration Map

Old (`react-router-dom` in `src/App.tsx`) → New (TanStack Router file routes under
`src/routes/`). **No route may silently disappear.** `Status` = code migrated;
`Tested` = verified by e2e/manual in Phase 6.

Legend: ✅ done · ⏳ planned · — n/a

## Public (SSR candidates)

| Old Route     | New Route (file)                         | SSR | Status | Tested |
| ------------- | ---------------------------------------- | --- | ------ | ------ |
| `/`           | `routes/index.tsx` → `LandingPage`       | yes | ⏳     | ⏳     |
| `/blog`       | `routes/blog/index.tsx` → `BlogListPage` | yes | ⏳     | ⏳     |
| `/blog/:slug` | `routes/blog/$slug.tsx` → `BlogPostPage` | yes | ⏳     | ⏳     |
| `/login`      | `routes/login.tsx` → redirect `/`        | —   | ⏳     | ⏳     |
| `/signup`     | `routes/signup.tsx` → redirect `/`       | —   | ⏳     | ⏳     |
| `*` (unknown) | root `notFoundComponent` → redirect `/`  | —   | ⏳     | ⏳     |

## Authenticated portal `/app/*` (client-rendered)

Wrapped by `routes/app/route.tsx` (pathless-equivalent `_authenticated` gate:
auth check + Supabase hydration + `AppShell`).

| Old Route                   | New Route (file)                             | Status | Tested |
| --------------------------- | -------------------------------------------- | ------ | ------ |
| `/app` (index)              | `routes/app/index.tsx` → `DashboardPage`     | ⏳     | ⏳     |
| `/app/jobs`                 | `routes/app/jobs.tsx`                        | ⏳     | ⏳     |
| `/app/production`           | `routes/app/production.tsx`                  | ⏳     | ⏳     |
| `/app/materials`            | `routes/app/materials.tsx`                   | ⏳     | ⏳     |
| `/app/deliveries`           | `routes/app/deliveries/index.tsx`            | ⏳     | ⏳     |
| `/app/deliveries/:id/print` | `routes/app/deliveries/$id.print.tsx`        | ⏳     | ⏳     |
| `/app/invoices`             | `routes/app/invoices/index.tsx`              | ⏳     | ⏳     |
| `/app/invoices/:id/print`   | `routes/app/invoices/$id.print.tsx`          | ⏳     | ⏳     |
| `/app/payments`             | `routes/app/payments.tsx`                    | ⏳     | ⏳     |
| `/app/expenses`             | `routes/app/expenses.tsx`                    | ⏳     | ⏳     |
| `/app/reports`              | `routes/app/reports.tsx`                     | ⏳     | ⏳     |
| `/app/companies`            | `routes/app/companies.tsx`                   | ⏳     | ⏳     |
| `/app/approvals`            | `routes/app/approvals.tsx` (SuperAdmin gate) | ⏳     | ⏳     |
| `/app/settings`             | `routes/app/settings.tsx`                    | ⏳     | ⏳     |
| `/app/*` (unknown)          | app `notFoundComponent` → redirect `/app`    | ⏳     | ⏳     |

## Param-name mapping

- react-router `:id` → TanStack `$id` (`Route.useParams().id`).
- react-router `:slug` → TanStack `$slug` (`Route.useParams().slug`).

## Deep-link / bookmark guarantees

`/app/deliveries/<id>/print` and `/app/invoices/<id>/print` must remain directly
loadable (with auth) — covered by e2e in Phase 6.
