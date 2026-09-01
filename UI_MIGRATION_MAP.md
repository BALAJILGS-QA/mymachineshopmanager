# UI_MIGRATION_MAP.md — custom UI → shadcn/ui + Radix

> Status: **PLAN ONLY — no components migrated yet.** All rows `Pending`.
> Current state: **no shadcn/ui, no Radix, no `components.json`** (0 `@radix-ui/*` in the lockfile). All primitives are hand-written Tailwind components. Brand is **apple-green**; target direction is **white + charcoal + industrial orange + Lucide**.
> Rule: wrap Radix primitives in reusable app components (don't scatter raw Radix through business code). Search before creating — reuse the existing component's props/behaviour; preserve accessibility and keyboard behaviour.

---

## Foundational setup (before component migration)

| Item            | Now                                                                     | Target                                   | Notes                                                          |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| shadcn init     | none                                                                    | `components.json`, `lib/utils.ts` (`cn`) | Adds `tailwind-merge` + `class-variance-authority`.            |
| Radix           | none                                                                    | `@radix-ui/react-*` per component        | Pulled in transitively by shadcn components.                   |
| Icons           | `lucide-react` 0.468                                                    | keep                                     | Already target-stack.                                          |
| Toasts          | custom `Toast.tsx` context                                              | **Sonner** (shadcn)                      | Preserve `useToast()` call sites via a thin adapter.           |
| Design tokens   | `brand` green + `canvas/surface/ink/muted/line` in `tailwind.config.js` | CSS variables + charcoal/orange palette  | Central token swap; keep semantic names to limit blast radius. |
| className merge | `clsx`                                                                  | `cn()` (clsx + tailwind-merge)           |                                                                |

---

## `src/components/ui/` → shadcn/Radix

| Existing                               | File                      | New                                                               | Radix primitive                    | Risk                                           | Status  |
| -------------------------------------- | ------------------------- | ----------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------- | ------- |
| `Field`, `Input`, `Select`, `Textarea` | `primitives.tsx`          | shadcn `Form`+`FormField`, `Input`, `Select`, `Textarea`, `Label` | `@radix-ui/react-select`, `-label` | Medium                                         | Pending |
| `Modal`                                | `Modal.tsx`               | shadcn `Dialog` (or `Sheet` for side panels)                      | `@radix-ui/react-dialog`           | **Medium** (used by ~8 pages)                  | Pending |
| `ConfirmDialog`                        | `ConfirmDialog.tsx`       | shadcn `AlertDialog` (keep `useConfirm()` API)                    | `@radix-ui/react-alert-dialog`     | Medium                                         | Pending |
| `Toast`                                | `Toast.tsx`               | **Sonner** + `useToast()` adapter                                 | —                                  | Medium                                         | Pending |
| `DateInput`                            | `DateInput.tsx`           | shadcn `Popover` + `Calendar` (Date Picker)                       | `@radix-ui/react-popover`          | Medium                                         | Pending |
| `MultiSelectDropdown`                  | `MultiSelectDropdown.tsx` | shadcn `Command` + `Popover` (multi-select combobox)              | `-popover`, cmdk                   | **High** (custom keyboard/selection behaviour) | Pending |
| `Logo`                                 | `Logo.tsx`                | keep (rebrand asset)                                              | —                                  | Low                                            | Pending |

## `src/components/common/` → ERP design-system components

| Existing          | File                  | New                                                           | Risk   | Status  |
| ----------------- | --------------------- | ------------------------------------------------------------- | ------ | ------- |
| `PageHeader`      | `PageHeader.tsx`      | `PageHeader` (title + description + primary action) on shadcn | Low    | Pending |
| `Filters`         | `Filters.tsx`         | `FilterBar` / `FilterChip` (Input + Select + Badge)           | Medium | Pending |
| `Pagination`      | `Pagination.tsx`      | `DataTablePagination` (shadcn Button/Select)                  | Low    | Pending |
| `Skeleton`        | `Skeleton.tsx`        | shadcn `Skeleton`                                             | Low    | Pending |
| `StatTile`        | `StatTile.tsx`        | `SummaryCard` on shadcn `Card` (restrained, not giant)        | Low    | Pending |
| `status.tsx`      | `status.tsx`          | `StatusBadge` on shadcn `Badge` (map status→variant)          | Low    | Pending |
| `WorkflowStepper` | `WorkflowStepper.tsx` | `ActivityTimeline`/`Stepper` (Radix-free or Tabs-based)       | Medium | Pending |

## `src/components/layout/` → premium app shell

| Existing                                                                      | File                   | New                                                                                                               | Risk                                                                                 | Status  |
| ----------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------- |
| `AppShell` (sidebar + top header + mobile bottom nav, collapse, active state) | `AppShell.tsx` (15 KB) | shadcn-based ERP shell: charcoal `Sidebar` + `Tooltip` (collapsed) + `Breadcrumb` + top header + `Sheet` (mobile) | **High** (core surface; TanStack `Link`/`useLocation` → Next `<Link>`/`usePathname`) | Pending |
| `nav.ts` (nav model)                                                          | `nav.ts`               | keep model; retype `to` from `LinkProps['to']` → `string`/`Route` (Next)                                          | Medium                                                                               | Pending |

## Data tables (cross-cutting)

| Concern                                                                             | Now                                                    | Target                                                                                                                                                        | Risk                                    | Status  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------- |
| List tables (Jobs, Invoices, Payments, Vendors, Materials, Deliveries, Expenses, …) | Hand-rolled tables + `Filters` + `Pagination` per page | Shared `DataTable` (shadcn `Table` + optional TanStack Table) with search/sort/filter/pagination/row-actions; **stay tabular on desktop** (no card-ification) | **High** (many pages, behaviour parity) | Pending |

## Forms (design-system side; logic covered in forms phase)

| Form               | File                                                                | New shell                       | Risk          | Status  |
| ------------------ | ------------------------------------------------------------------- | ------------------------------- | ------------- | ------- |
| Auth               | `features/auth/AuthForm.tsx`                                        | shadcn `Form` + RHF + Zod       | Medium        | Pending |
| Job                | `features/jobs/JobForm.tsx`                                         | shadcn `Form` + `FormSection`   | High          | Pending |
| Invoice            | `features/invoices/InvoiceForm.tsx`                                 | shadcn `Form` + line-item table | **Very high** | Pending |
| Payment            | `features/payments/PaymentForm.tsx`                                 | shadcn `Form`                   | High          | Pending |
| Materials          | `features/materials/MaterialForms.tsx`                              | shadcn `Form`                   | Medium        | Pending |
| Inline modal forms | Companies/Vendors/Expenses/Production/Subcontracting/Settings pages | shadcn `Dialog` + `Form`        | Medium        | Pending |

---

## Brand / visual direction change

| Token                            | Current (apple-green)             | Target (industrial)                                                     |
| -------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Primary action / active / accent | `brand` `#8db600` family          | **Industrial orange** (used sparingly — actions/active/highlights only) |
| Sidebar / nav / high-contrast    | light + green active bar          | **Charcoal**                                                            |
| Workspace / content bg           | `canvas #f7f9fc` / `surface #fff` | **White** primary workspace                                             |
| Secondary text / borders         | `muted #64748b` / `line #e2e8f0`  | **Neutral grays**                                                       |

Guardrails (from brief): orange must not dominate; avoid excessive gradients/glassmorphism/neon/oversized cards/heavy shadows/generic "AI dashboard" look. Information-dense, enterprise-grade, consistent across all modules.

---

## Sequencing (design-system phase — only after routes are functionally stable)

1. Init shadcn + tokens + `cn` + Sonner; define charcoal/orange palette as CSS variables.
2. Migrate leaf primitives first (Button/Input/Label/Select/Textarea/Badge/Skeleton/Card) — lowest risk, highest reuse.
3. Migrate Dialog/AlertDialog/Toast(Sonner)/Popover+Calendar/Command — preserve existing `useConfirm`/`useToast` APIs via adapters so call sites don't churn.
4. Rebuild `AppShell` (charcoal sidebar + breadcrumbs + mobile Sheet) once Next `<Link>`/`usePathname` are in place.
5. Introduce shared `DataTable` and roll modules onto it one at a time.
6. Rebrand pass + accessibility audit (focus states, ARIA, contrast, keyboard nav) across all modules.

Mark `Status: Done` per row only after the component renders, matches prior behaviour/props, passes accessibility (keyboard + focus + ARIA), and the pages using it stay green (typecheck + relevant Playwright spec).
