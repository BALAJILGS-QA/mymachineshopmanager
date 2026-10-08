-- ============================================================================
-- Production orders — job owner / planner from the HRM registry (HRM-C)
-- ============================================================================
-- A production order can record the HRM employee who owns / plans it, in
-- addition to the per-operation operator (0080) and the QC inspector (0081).
-- Nullable FK; set through the existing direct-column job update path
-- (updateRow) so the create_job / transition_job RPCs are untouched. No
-- RPC / policy change — consistent with the HRM-B assignee columns
-- (contact_messages.assigned_to_employee_id 0082, delivery_challans.driver_employee_id 0084).
--
-- Additive + idempotent. Reversible (drop column). Next free number after 0084.
-- ============================================================================

alter table public.job_orders
  add column if not exists owner_employee_id text references public.employees(id) on delete set null;
create index if not exists idx_job_orders_owner_emp on public.job_orders (owner_employee_id);

-- ROLLBACK: alter table public.job_orders drop column if exists owner_employee_id;
