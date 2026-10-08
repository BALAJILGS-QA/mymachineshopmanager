-- ============================================================================
-- Deliveries — delivery-challan driver/handler from the HRM registry (HRM-B)
-- ============================================================================
-- A delivery challan can record the employee who drove/handled the dispatch,
-- in addition to the vehicle number. Nullable FK; set through the existing
-- direct-column challan update path (updateRow) so the stock-dispatch RPC is
-- untouched. No RPC/policy change.
--
-- Additive + idempotent. Reversible (drop column). Next free number after 0083.
-- ============================================================================

alter table public.delivery_challans
  add column if not exists driver_employee_id text references public.employees(id) on delete set null;
create index if not exists idx_delivery_challans_driver on public.delivery_challans (driver_employee_id);

-- ROLLBACK: alter table public.delivery_challans drop column if exists driver_employee_id;
