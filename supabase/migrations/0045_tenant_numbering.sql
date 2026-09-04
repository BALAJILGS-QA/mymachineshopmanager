-- ============================================================================
-- Multi-tenant rollout, part 3: tenant-scoped numbering + per-tenant settings.
-- ============================================================================
-- Makes document numbering tenant-aware WITHOUT breaking existing numbers:
--   • existing doc_counters rows are re-keyed  key → 'tnt_sreebalaji:' || key
--     so the current running values continue unbroken for Sree Balaji.
--   • next_seq / peek_seq gain a tenant-scoped 2-arg form; the legacy 1-arg form
--     is kept and delegates to current_tenant_id(), so every existing caller
--     (numbering.ts) works unchanged and is now automatically tenant-scoped.
--
-- Also adds tenant_settings (per-tenant settings) additively; the current
-- app_state.data.settings blob is copied into the Sree Balaji row. The frontend
-- continues reading app_state until the settings hook is switched over (frontend
-- stage) — this migration does not remove app_state.
--
-- See docs/MULTI_TENANT_DESIGN.md §7–§8.
-- Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Re-key existing counters under the Sree Balaji tenant namespace.
--    Only re-key rows that are not already namespaced (contain no ':').
-- ---------------------------------------------------------------------------
update public.doc_counters
   set key = 'tnt_sreebalaji:' || key
 where key not like '%:%';

-- ---------------------------------------------------------------------------
-- 2. Tenant-scoped next_seq / peek_seq (2-arg), stored key = tenant || ':' || key
-- ---------------------------------------------------------------------------
create or replace function public.next_seq(p_tenant_id text, p_key text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint; k text := p_tenant_id || ':' || p_key;
begin
  insert into public.doc_counters (key, value) values (k, 1)
  on conflict (key) do update set value = public.doc_counters.value + 1
  returning value into v;
  return v;
end $$;

create or replace function public.peek_seq(p_tenant_id text, p_key text)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.doc_counters where key = p_tenant_id || ':' || p_key), 0) + 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. Legacy 1-arg forms delegate to the caller's active tenant.
--    (Existing callers in src/lib/api/numbering.ts keep working unchanged.)
-- ---------------------------------------------------------------------------
create or replace function public.next_seq(p_key text)
returns bigint language sql security definer set search_path = public as $$
  select public.next_seq(public.current_tenant_id(), p_key);
$$;

create or replace function public.peek_seq(p_key text)
returns bigint language sql stable security definer set search_path = public as $$
  select public.peek_seq(public.current_tenant_id(), p_key);
$$;

grant execute on function public.next_seq(text,text) to authenticated;
grant execute on function public.peek_seq(text,text) to authenticated;
grant execute on function public.next_seq(text) to authenticated;
grant execute on function public.peek_seq(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Per-tenant settings (additive; app_state stays until frontend switch).
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_settings (
  tenant_id  text primary key references public.tenants(id) on delete cascade,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Seed the Sree Balaji row from the current singleton settings blob.
insert into public.tenant_settings (tenant_id, data)
select 'tnt_sreebalaji', coalesce((select data -> 'settings' from public.app_state where id = 'singleton'), '{}'::jsonb)
on conflict (tenant_id) do nothing;

alter table public.tenant_settings enable row level security;
drop policy if exists tenant_settings_rw on public.tenant_settings;
create policy tenant_settings_rw on public.tenant_settings for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
