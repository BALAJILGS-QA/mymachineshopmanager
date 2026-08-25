-- =============================================================================
-- Job orders: QC-rejected quantity (recorded at machining completion).
-- Run in the Supabase SQL Editor before deploying the matching app build.
-- Idempotent: safe to re-run.
-- =============================================================================
alter table public.job_orders
  add column if not exists rejected_qty numeric;

-- Verify:
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='job_orders' and column_name='rejected_qty';
