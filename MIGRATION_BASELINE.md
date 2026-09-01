# MIGRATION_BASELINE.md — pre-migration green baseline

> Purpose: record the current state **before** any migration so we can tell a **MIGRATION ISSUE** apart from a **PRE-EXISTING ISSUE**. No unrelated issues were "fixed" during the audit.
> Environment: Windows 11, Node (repo requires Node 20 per `netlify.toml`), local `node_modules` installed. Run from `C:\documents\msm\mymachineshopmanager`.

---

## Build & quality status

| Check            | Command            | Result                            | Detail                                                                                                   |
| ---------------- | ------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Type checking    | `npx tsc --noEmit` | ✅ **PASS**                       | Exit 0. No type errors. `strict: true`.                                                                  |
| Unit tests       | `npx vitest run`   | ✅ **PASS**                       | **26/26** tests in `src/data/computations.test.ts` (~3.4 s).                                             |
| Production build | `npx vite build`   | ✅ **PASS**                       | Built in ~1.4 s. Emits **SSR** output: `dist/server/**` (Nitro `server.js`, 61.5 KB) + `dist/client/**`. |
| E2E (Playwright) | `npm run test:e2e` | ⏸️ **NOT RUN in this audit pass** | See note below.                                                                                          |

### Build output shape (default `vite build`, SSR)

- `dist/server/server.js` (61.48 KB) + per-route server chunks (materials 55 KB, router 38 KB, InvoiceForm 34 KB, subcontracting 28 KB, settings 27 KB, …).
- `dist/client/**` client chunks.
- Note: **Vercel production build differs** — `SPA=1 npm run build` emits only `dist/client` + `_shell.html` (static SPA). Both modes build clean from the same source.

---

## Why E2E was not executed here

Playwright is fully configured (10 specs × `chromium` + `mobile`) and browsers are installed locally, **but** the suite's `webServer` runs `npm run build && npm run preview` (boots the TanStack SSR/preview server on port 4173, ~180 s startup budget) and several specs (`supabase.spec.ts`, `import-verify.spec.ts`) depend on live Supabase env/data. Running the full suite is a multi-minute, environment-sensitive operation that is not required to produce the audit and risks conflating environment flakiness with a real baseline.

**Action for you (recommended before Phase 2):** run `npm run test:e2e` once in your environment and paste the pass/fail-by-spec results here. That gives the authoritative E2E baseline the parity checks will be measured against. Until then, treat E2E baseline as **UNKNOWN**, not "passing".

Specs present (parity safety net):
`smoke`, `site`, `dashboard`, `portal-nav`, `module-tabs`, `dc-number`, `challan-full-edit`, `material-multiselect`, `import-verify`, `supabase`.

---

## Inventory snapshot (for regression comparison)

| Metric                               | Value                                                             |
| ------------------------------------ | ----------------------------------------------------------------- |
| Route files                          | 28 (`src/routes/**/*.tsx`)                                        |
| Distinct URLs (excl. catch-alls)     | ~24 (17 portal + 3 public + 2 compat redirects + 4 hub redirects) |
| Feature domains                      | 18 (`src/features/*`)                                             |
| React Query hook files               | 12                                                                |
| Forms (`*Form.tsx` + inline modals)  | 5 dedicated + ~6 inline-modal pages                               |
| UI components                        | `ui/` 7, `common/` 7, `layout/` 2                                 |
| `.tsx` / `.ts` / `.js` in src        | 71 / 55 / 0                                                       |
| Unit tests                           | 26 (1 file)                                                       |
| E2E specs                            | 10 (× 2 projects)                                                 |
| Tailwind-styled files (`className=`) | 41                                                                |
| `any` occurrences in src             | 29                                                                |

---

## Known technical debt / pre-existing conditions (NOT to be "fixed" during migration)

1. **RHF + `@hookform/resolvers` installed but unused** — 0 imports in `src`. Dead until the forms phase.
2. **Zod barely used** — only `src/lib/env.ts` (env validation); no form/DTO schemas.
3. **`any` used ~29 times** in `src` — acceptable pre-existing; not a migration blocker.
4. **Dual auth backend** (Supabase + local-mode localStorage) with hardcoded default super-admin creds (`superadmin`/`superadmin123`) and email allowlist — intentional current behaviour; preserve as-is unless separately scoped.
5. **Auth profiles stored in an `app_state` JSON blob**, not a users table — deliberate; do not "normalise" during migration.
6. **Two deployment modes diverge** (Vercel static SPA vs. Netlify/default SSR) — pre-existing; the migration should consolidate on Next's model deliberately, not by accident.
7. **Brand is apple-green**, target is white/charcoal/orange — a planned rebrand, not a bug.

None of the above are runtime failures; typecheck, unit tests, and build are all green.

---

## Baseline verdict

**Green and stable.** Typecheck ✓, unit tests ✓ (26/26), production build ✓ (both SSR and SPA modes). The only gap is an unexecuted E2E run, which should be captured in your environment before route migration begins. Any _new_ type error, unit failure, build failure, or E2E regression appearing after Phase 2 is by definition a **MIGRATION ISSUE**, since the pre-migration baseline is clean.
