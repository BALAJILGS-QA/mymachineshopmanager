-- =============================================================================
-- Registration approval — HARD security boundary (Row Level Security)
--
-- Run this once in the Supabase SQL Editor (Dashboard → SQL → New query).
-- It is idempotent: safe to re-run.
--
-- Effect: a signed-in user can read/write business data ONLY if they are a
-- super admin OR have been explicitly approved. Approval lives in a table that
-- users cannot write directly — only a super admin can grant/revoke it — so a
-- pending user with a valid auth token still gets ZERO access to any data.
-- =============================================================================

-- 1) Super admins: full access + the only ones who may approve others.
--    Keep this list in sync with SUPER_ADMIN_EMAILS in
--    src/features/auth/auth.tsx.
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (array[
    'admin@sreebalajiindustries.com'
  ]);
$$;

-- 2) Approval registry. RLS is enabled with NO policies, so no client role can
--    touch it directly; only the SECURITY DEFINER functions below (which run as
--    the table owner) read and write it. This is what makes approval tamper-proof.
create table if not exists public.approved_users (
  email       text primary key,
  role        text not null default 'User',
  approved_by text,
  approved_at timestamptz not null default now()
);
alter table public.approved_users enable row level security;

-- 3) The access gate used by every data-table policy.
create or replace function public.is_app_approved()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (
        select 1 from public.approved_users a
        where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
$$;

-- 4) Grant / revoke approval. Callable by any signed-in user, but it only ACTS
--    when the caller is a super admin (checked inside). Approve = insert row,
--    reject = delete row (revokes access immediately on next request).
create or replace function public.set_user_approval(p_email text, p_approved boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may change approvals';
  end if;
  if p_approved then
    insert into public.approved_users (email, role, approved_by)
    values (lower(p_email), 'User', coalesce(auth.jwt() ->> 'email', 'admin'))
    on conflict (email) do update
      set approved_at = now(), approved_by = excluded.approved_by;
  else
    delete from public.approved_users where lower(email) = lower(p_email);
  end if;
end;
$$;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_app_approved() to authenticated;
grant execute on function public.set_user_approval(text, boolean) to authenticated;

-- 5) Replace the permissive per-table policy with an approval-gated one on every
--    business-data table.
do $$
declare t text;
begin
  foreach t in array array[
    'companies','materials','products','job_orders','production_events',
    'material_receipts','material_issues','stock_adjustments','delivery_challans',
    'invoices','invoice_lines','payments','expenses','audit_log'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists auth_all on public.%I;', t);
    execute format('drop policy if exists approved_all on public.%I;', t);
    execute format(
      'create policy approved_all on public.%I for all to authenticated '
      'using (public.is_app_approved()) with check (public.is_app_approved());', t);
  end loop;
end $$;

-- 6) app_state stays open to authenticated users on purpose: sign-up needs to
--    record the pending profile, the login screen reads the applicant's status
--    for its message, and settings/sequences sync through it. It holds no
--    business records, and it CANNOT be used to bypass the gate (access is
--    decided solely by approved_users, which only a super admin can change).
alter table public.app_state enable row level security;
drop policy if exists auth_all on public.app_state;
create policy auth_all on public.app_state for all to authenticated using (true) with check (true);

-- 7) One-time backfill: carry over anyone already marked approved in the app's
--    stored user list so existing users keep access after this migration.
insert into public.approved_users (email, role, approved_by)
select lower(u ->> 'email'), coalesce(u ->> 'role', 'User'), 'backfill'
from public.app_state s
cross join lateral jsonb_array_elements(coalesce(s.data -> 'users', '[]'::jsonb)) u
where s.id = 'singleton' and (u ->> 'status') = 'approved'
on conflict (email) do nothing;

-- Done. Verify with:
--   select * from public.approved_users;
--   select public.is_app_approved();   -- run while signed in
