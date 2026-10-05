-- 0066_fix_set_tenant_plan_overload.sql
--
-- BUGFIX: migration 0065 added set_tenant_plan(text, text) (with a default billing
-- cycle) but the original set_tenant_plan(text) from 0062 was left in place. Two
-- overloads where the second arg is optional makes the PostgREST call
-- `rpc('set_tenant_plan', { p_plan })` ambiguous — Postgres raises
-- "function set_tenant_plan(unknown) is not unique" and the Upgrade action failed
-- with "Could not update plan". Drop the obsolete single-arg version so only the
-- current (billing-cycle aware) function remains. Idempotent.

drop function if exists public.set_tenant_plan(text);
