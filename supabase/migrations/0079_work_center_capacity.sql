-- ============================================================================
-- Production Planning — Work-centre capacity
-- ============================================================================
-- The Production Schedule groups pending/in-progress operations by work centre
-- and sums their estimated load (setup + cycle × planned qty). To turn that into
-- real finite-capacity planning it needs each cell's available capacity. This
-- adds a single daily-capacity figure to the work-centre master.
--
--   capacity_hours_per_day — available production hours per day for the cell
--     (null = unknown / treated as uncapped in the schedule). Simple master
--     data: edited directly under the existing work_centers tenant RLS (0075);
--     no RPC or policy change.
--
-- Additive + idempotent. Reversible: drop the column. Next free number after 0078.
-- ============================================================================

alter table public.work_centers
  add column if not exists capacity_hours_per_day numeric;

-- ROLLBACK: alter table public.work_centers drop column if exists capacity_hours_per_day;
