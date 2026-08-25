-- =============================================================================
-- Invoice columns: CGST / SGST split, delivery-challan reference, ship-to.
--
-- Run this in the Supabase SQL Editor BEFORE deploying the app build that maps
-- these fields (otherwise invoice sync will fail on the unknown columns).
-- Idempotent: safe to re-run.
-- =============================================================================
alter table public.invoices
  add column if not exists cgst_percent     numeric,
  add column if not exists sgst_percent     numeric,
  add column if not exists dc_reference     text,
  add column if not exists shipping_address text;

-- Verify:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'invoices'
--     and column_name in ('cgst_percent','sgst_percent','dc_reference','shipping_address');
