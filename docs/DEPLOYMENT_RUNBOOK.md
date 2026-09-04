# MSM — Deployment Runbook (DB hardening + multi-tenant, 0039–0047)

This is the exact, ordered procedure to take migrations `0039–0047` + the
`set-active-tenant` Edge Function to DEV then production. It requires access this
environment does not have (Supabase project credentials, a confirmed backup), so
it is written to be run by someone with that access.

> **Important context:** `scripts/deploy.mjs` deploys the **frontend only**
> (git push → Vercel). It does **NOT** apply database migrations. Migrations are a
> **separate manual step** (Supabase SQL editor or `supabase db push`). Do the DB
> step first, then the frontend.

## 0. Pre-flight (do not skip)

- [ ] Confirm a **backup / PITR** point on the target Supabase project.
- [ ] Confirm you are pointing at **DEV first**, not production.
- [ ] Working tree is clean of unrelated WIP (see note at bottom — a separate
      bank-import change is currently uncommitted/committed in this repo; commit
      or stash deliberately so a deploy doesn't sweep half-finished work).
- [ ] `npm run typecheck && npm run test && npm run build` all green.

## 1. Capture the "before" snapshot (DEV)

```
psql "$DEV_DATABASE_URL" -f supabase/verify_migration.sql > before.txt
```

## 2. Apply migrations in order (DEV)

Either with the Supabase CLI:

```
supabase link --project-ref <DEV_REF>
supabase db push        # applies 0039..0047 in filename order
```

…or paste each file 0039→0047 into the SQL editor **in order**. 0040 and 0043
self-abort (with a clear message) if existing data violates a new rule — if that
happens, fix the reported rows and re-run; nothing is left half-applied.

## 3. Capture "after" + diff (DEV)

```
psql "$DEV_DATABASE_URL" -f supabase/verify_migration.sql > after.txt
diff before.txt after.txt
```

**Expected:** sections 1–8 identical (counts, AR totals, GL imbalance = 0, trial
balance, stock, payments, payroll, tool on-hand). Sections 9–10 must report
**0 null-tenant and 0 orphan-tenant rows**.

## 4. Run the isolation test (DEV)

```
psql "$DEV_DATABASE_URL" -f supabase/tests/tenant_isolation_test.sql
```

Must print `ALL TENANT-ISOLATION CHECKS PASSED` and exit 0 (it rolls back its
fixtures). A non-zero exit = a failed isolation guarantee — stop.

## 5. Regression smoke (DEV app)

Point the DEV app at the DEV DB and exercise: create job → challan → invoice →
payment; stock receipt/issue/adjustment/transfer; expense; journal post + trial
balance; bank import + post; tool receive/issue/return; employee + leave +
payroll run. All should behave exactly as before (rows now carry `tenant_id`
automatically).

## 6. Deploy the Edge Function (enables multi-tenant switching — H-2)

```
supabase functions deploy set-active-tenant
supabase secrets set SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<service_role>
```

Not required for the current single-tenant operation; required before a
multi-membership user can switch active tenant.

## 7. Promote to production

- [ ] Re-confirm production backup.
- [ ] Repeat steps 1–4 against **production** (`$PROD_DATABASE_URL`).
- [ ] Deploy the frontend: `npm run deploy -- "db: multi-tenant hardening 0039–0047"`
      (build → push dev → ff main → Vercel prod build). Watch the Vercel dashboard.
- [ ] Production smoke test (login, dashboard, each module read + one safe write).
- [ ] Final security check: from a second-tenant test account (once one exists),
      confirm it cannot see/modify tenant-1 data.

## 8. Onboard a new tenant (later)

```
select public.provision_tenant('tnt_acme','ACME','Acme Pvt Ltd','owner@acme.com');
```

Then the owner signs in; `set-active-tenant` (step 6) lets multi-tenant users
switch. Wire `<TenantSwitcher/>` (`src/features/tenant/`) into the app header.

## Rollback

- Before go-live is confirmed, keep the backup.
- 0043 (nullable add) → `alter table … drop column tenant_id` per table.
- 0044 (enforce) → drop the `tenant_isolation` policies + `alter column … drop not null / drop default`, restore `approved_all` policies.
- 0040/0043 abort on bad data, so they never partially apply.
- Frontend: Vercel → promote the previous production deployment.

---

### Note on the concurrent bank-import change

`0038_bank_import_fixes.sql` (commit `1a5c4fa`) and some `src/features/finance/*`
files are a **separate** change in flight in this repo. This program's work is
migrations `0039–0047`, `supabase/functions/set-active-tenant`,
`src/features/tenant/*`, `supabase/verify_migration.sql`,
`supabase/tests/tenant_isolation_test.sql`, and the `docs/DATABASE_*` /
`MULTI_TENANT_DESIGN` files. Commit these deliberately and separately from the
bank-import WIP.
