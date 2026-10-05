# Functional E2E suite (onboarding lifecycle)

Playwright + TypeScript functional tests that drive the **real** MSM app and backend
through a new customer's onboarding journey:

> **signup → super-admin approval → sign in → verify the (empty) dashboard**

## Layout

```
e2e/functional/
├─ tests/onboarding.spec.ts     # the lifecycle spec (test.step per phase)
├─ fixtures.ts                  # testUser (unique + auto-teardown) + superAdminPage
├─ pages/                       # Page Objects
│  ├─ SignupPage.ts             #   /signup
│  ├─ LoginPage.ts              #   /login
│  ├─ ApprovalsPage.ts          #   /app/approvals (super admin)
│  └─ DashboardPage.ts          #   /app (empty-data assertions)
└─ support/
   ├─ env.ts                    # target + credentials (secrets from env only)
   ├─ test-user.ts              # unique applicant generator
   └─ admin-backend.ts          # TEST-PREREQUISITE backend helper (Management API)
playwright.functional.config.ts # config (root)
```

## What is real vs. simulated

- **Real UI** drives every product behaviour: the signup form, the super-admin
  Approvals screen (the actual approve action), the login page, and the dashboard.
- **`admin-backend.ts`** performs only what a human/mailbox would otherwise own and
  CI cannot: it confirms the signup email (this Supabase project has
  `mailer_autoconfirm = false`, and there is no mailbox) and deletes the test user
  afterwards so the shared backend stays clean. It never performs the approval — the
  super admin does that in the UI.

## Required environment

Public values (app URL, Supabase anon key/ref) default safely. Two secrets must be
provided (e.g. `set -a; source ../../.env.deploy.local; set +a`, then export the
super-admin password):

| Var                     | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `SUPER_ADMIN_PASSWORD`  | Password for `admin@sreebalajiindustries.com`            |
| `SUPABASE_ACCESS_TOKEN` | Supabase Management API token (email-confirm + teardown) |

Optional overrides: `FUNC_BASE_URL` (default = deployed prod),
`SUPER_ADMIN_EMAIL`, `SUPABASE_PROJECT_REF`.

## Run

```bash
# against deployed prod (default)
SUPER_ADMIN_PASSWORD=… SUPABASE_ACCESS_TOKEN=… npm run test:func

# against a local build you start yourself
FUNC_BASE_URL=http://localhost:3200 npm run test:func

npm run test:func:report   # open the HTML report
```

## Notes

- Tests run **serially** (`workers: 1`) — they mutate the shared approval queue.
- Each run creates a disposable user `msm-e2e-<stamp>@msmqa.test` and removes it in
  teardown (incl. the tenant it provisioned).
- If you point this at a dedicated test project with email auto-confirm enabled, the
  `confirmEmail` step becomes a harmless no-op.
- Extend the suite by adding Page Objects under `pages/` and specs under `tests/`;
  keep product actions in Page Objects and backend prerequisites in `support/`.
