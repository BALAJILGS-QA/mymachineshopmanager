-- ============================================================================
-- Expenses — link a payee to an HRM employee (HRM-B)
-- ============================================================================
-- When an expense is paid to a staff member (reimbursement, advance, cash to
-- self), the payee can now reference the HRM employee registry in addition to
-- the free-text payee name. Nullable FK; expenses are direct-table writes under
-- tenant RLS — no RPC/policy change.
--
-- Additive + idempotent. Reversible (drop column). Next free number after 0082.
-- ============================================================================

alter table public.expenses
  add column if not exists payee_employee_id text references public.employees(id) on delete set null;
create index if not exists idx_expenses_payee_employee on public.expenses (payee_employee_id);

-- ROLLBACK: alter table public.expenses drop column if exists payee_employee_id;
