-- 0060_fix_super_admin_allowlist.sql
--
-- SECURITY FIX — cross-tenant data leak.
--
-- The live definition of public.is_super_admin_email() had drifted (it was last
-- changed directly in the database, not through a tracked migration) and wrongly
-- listed a REGULAR self-serve tenant owner, sreebalajiindustries96@gmail.com, as a
-- super admin. Because public.current_tenant_ids() returns EVERY tenant when
-- is_super_admin() is true, that account resolved to all tenants and could read
-- every other tenant's data (e.g. all of Sree Balaji Industries' companies,
-- invoices and payments) — a cross-tenant leak.
--
-- This restores the correct super-admin allow-list so it matches the single source
-- of truth in the frontend, src/features/auth/auth.tsx (SUPER_ADMIN_EMAILS):
--   admin@sreebalajiindustries.com, balajin04@outlook.com
--
-- Effect: sreebalajiindustries96@gmail.com becomes a normal single-tenant user and
-- only sees its own tenant; genuine super admins are unchanged. Idempotent
-- (CREATE OR REPLACE); safe to re-run.

create or replace function public.is_super_admin_email(p_email text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select lower(coalesce(p_email, '')) = any (array[
    'admin@sreebalajiindustries.com',
    'balajin04@outlook.com'
  ]);
$$;
