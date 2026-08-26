# Phase 5b + 6 — Supabase-direct data layer & server-side rules

> **Status:** planning (no prod-DB change yet). Awaiting sign-off before applying
> SQL migrations to the live project (`ydhvsiixwmbxoumglpvq`) and validating
> writes against it.

## The dependency

After Phase 5a, `features/*/api/*.ts` are the single swap point. Phase 5b re-points
them from the repo/localStorage store to Supabase. But the repo currently enforces
**all business rules** (they only "work" because the repo is the sole write path):

| Rule (today in repo.ts)                                    | How it must be enforced server-side                             |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| Document numbering (JOB-1, INV-1, …) atomic per type       | Postgres counter + atomic RPC (`next_seq`)                      |
| Non-negative stock (own vs customer scope) unless override | `create_material_issue` RPC / trigger checking `material_stock` |
| Auto-issue material when a job is created                  | `create_job` RPC (job + issue in one transaction)               |
| Invoice cancel → release linked challans                   | trigger on `invoices` status change                             |
| Challan reopen guard (not while live invoice links it)     | RPC / trigger                                                   |
| Uniqueness (codes, doc numbers)                            | already covered by `unique` constraints ✅                      |
| qty > 0, rate ≥ 0, signed adj ≠ 0                          | already covered by `check` constraints ✅                       |
| Delete guards (referenced entity)                          | FK `on delete restrict` (default) ✅ / RPC message              |

Many invariants are **already** enforced by the existing schema (unique + check +
FK). The gaps needing new server-side logic are: **numbering, stock checks,
job auto-issue, invoice→challan cascade, challan reopen.**

## Approach options for the write path

**Option A — RPC per mutation (recommended).** Each create/status mutation becomes
a `SECURITY INVOKER` Postgres function (or Edge Function) that runs the rule +
write in one transaction. `api/*.ts` calls `supabase.rpc('create_job', …)`.
Pros: rules atomic + authoritative; API stays thin. Cons: more SQL to write.

**Option B — Direct table writes + atomic counter + triggers.** `api` does
`supabase.from().insert()`; a `before insert` trigger assigns the doc number from
an atomic counter; check/FK constraints + a stock-guard trigger enforce the rest.
Pros: fewer RPCs. Cons: cross-row rules (auto-issue, cascade) still need triggers;
harder to return friendly messages.

Recommendation: **A for the rule-bearing mutations** (job create, material issue,
invoice cancel, challan reopen/status, numbering), **B/direct for simple CRUD**
(companies, materials master, products, expenses, payments basic insert with a
numbering trigger).

## Read path (safe, no rules)

`list*` api functions → `supabase.from(table).select(...)` with server-side
filters/pagination where useful. Invoice lines join in. This is low-risk and can
land first per entity.

## Migration & validation safety

1. All schema changes are **additive, reversible** SQL migration files under
   `supabase/migrations/` (or `docs/`), each idempotent. **No DROP/TRUNCATE.**
2. A fresh **prod backup** is taken immediately before applying (we already have
   `supabase-backup-2026-08-26.json`; re-dump before each apply).
3. Apply to the live project via the Supabase Management API (SQL), reviewed first.
4. Flip one entity at a time: reads → writes → retire its store usage; run the
   gate + a live smoke (create/edit/delete a throwaway record) after each.
5. Retire `data/backend.ts` (loadAll/syncThrough) and the store-as-source only
   after every entity is migrated. Keep localStorage strictly for UI prefs.

## Rollout order (low-risk first)

companies → products → expenses → materials(master) → payments → invoices →
deliveries → jobs+stock (most rules) → production → users/settings → retire store.

## Prerequisite decisions (need owner sign-off)

- Approve applying additive SQL migrations to the **live** DB + live write tests
  (prod is near-empty: 1 company, 1 job, 1 challan — very low risk).
- Confirm the write-enforcement approach (A vs B, recommend A for rule-bearing).
- Numbering: keep existing patterns (`{FY}{YYYY}{YY}{MM}{####}`) — reimplement the
  formatter in plpgsql, or use an atomic integer RPC + keep client-side formatting
  (simpler, still race-free). Recommend the latter.
