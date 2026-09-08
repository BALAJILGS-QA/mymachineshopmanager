# QA-Orchestra — automated QA pipeline for MSM

An agent-driven pipeline that turns each app module into reviewed manual test
cases (Zephyr Scale format) and stabilized Playwright automation, executed by a
dedicated **QA super-admin** account against the target environment.

## QA test environment

| Item        | Value                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| Login       | `balajin04@outlook.com` (username `Balajin`)                                           |
| Access      | **SuperAdmin** — approved in `app_state.users` + in `SUPER_ADMIN_EMAILS`               |
| Password    | stored in `.env` as `QA_PASSWORD` (rotate after use)                                   |
| Target      | live production `https://mymachineshopmanager.vercel.app` (`QA_BASE_URL`)              |
| Credentials | `.env` (gitignored): `QA_EMAIL`, `QA_PASSWORD`, `QA_USERNAME`, `APP_EMAIL`, `APP_PASS` |

> The client-side SuperAdmin flag (approvals + admin-only routes) takes effect on
> prod only after the `auth.tsx` change is deployed. Data access works immediately
> because RLS is `auth_all` (any approved authenticated user sees all rows).

## The 6 phases

1. **Understand** — an agent reads each module's source (`src/features/<domain>`,
   route file) and summarizes real entities, forms, validations, workflows, and
   Supabase API/RPC calls.
2. **Author manual cases** — Zephyr Scale cases across **UI, Validation,
   Functionality, API, Security, Database**.
3. **Review** — a QA-lead agent refines cases (coverage balance, keys, destructive
   flags), then they're written to CSV (`qa/manual-testcases/<module>.csv` +
   `all-testcases.csv`).
4. **Automate** — a Playwright spec per module in `e2e/generated/<module>.spec.ts`.
5. **Reuse review** — specs must import ONLY from `e2e/support` and reuse the
   shared locators/actions/verifications (no re-implementation).
6. **Stabilize** — run the non-destructive suite against the target, fix flakes,
   and flip `Automation` → `Automated` in the CSV for passing cases.

## Reusable support library (`e2e/support/`)

Generated specs import a single surface — `import { ... } from '../support'`:

- `auth.ts` — `loginAsQA`, `isAuthenticated` (+ `auth.setup.ts` saves storageState)
- `nav.ts` — `gotoModule`, `navByLabel`, `expectHeading`, `hasClientCrash`
- `data-table.ts` (`dt.*`) — `rowCount`, `rowByText`, `isEmptyState`, `search`, `expectRow`
- `forms.ts` (`forms.*`) — `openForm`, `fill`, `select`, `submit`, `expectValidationError`
- `assertions.ts` — `expectToast`, `expectHealthy`, `expectNoFailedRequests`
- `modules.ts` — canonical module registry (mirrors `src/components/layout/nav.ts`)

## Safety model (running against production)

- Default runs are **non-destructive** (read / navigate / validate). Assertions
  are data-tolerant (e.g. `rowCount >= 0`).
- Create/update/delete tests are generated but tagged **`@destructive`** and
  **excluded** unless `QA_ALLOW_DESTRUCTIVE=1`. They must clean up after themselves.

## Commands

```bash
npm run qa            # run the non-destructive QA suite against QA_BASE_URL
npm run qa:report     # open the HTML report (qa/reports/html)
npm run qa:csv        # (re)build Zephyr CSVs from qa/manual-testcases/_raw/*.json

# opt in to destructive tests (creates/edits/deletes real data):
QA_ALLOW_DESTRUCTIVE=1 npm run qa
```

## Re-running / extending the pipeline

The orchestration lives in `qa/qa-orchestra.workflow.mjs`. Run it for any subset
of modules (or all, from `e2e/support/modules.ts`) via the Workflow tool with the
module list as `args`. Outputs land in `qa/manual-testcases/_raw/<id>.json`; then
`npm run qa:csv` builds the CSVs and `scripts/qa-testcases.mjs mark-automated`
flips passing cases to Automated.
