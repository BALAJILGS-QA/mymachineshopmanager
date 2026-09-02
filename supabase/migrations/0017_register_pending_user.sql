-- =============================================================================
-- 0017_register_pending_user — secure self-registration.
--
-- app_state is approval-gated (is_app_approved), so a just-signed-up applicant
-- (still 'pending') cannot write their own profile directly — the sign-up write
-- was failing with RLS 403. This SECURITY DEFINER function appends the applicant
-- to app_state.data.users with status HARD-FORCED to 'pending', running as the
-- table owner. It can never mark anyone approved, so the approval gate is intact:
-- only a super admin flips status to 'approved' (via the approvals screen +
-- set_user_approval on approved_users). Idempotent: safe to re-run.
-- =============================================================================

create or replace function public.register_pending_user(
  p_email     text,
  p_full_name text,
  p_company   text default '',
  p_phone     text default '',
  p_address   text default '',
  p_gstin     text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  cur   jsonb;
  users jsonb;
begin
  if coalesce(btrim(p_email), '') = '' then
    raise exception 'Email is required';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'Full name is required';
  end if;

  select data into cur from public.app_state where id = 'singleton' for update;
  if cur is null then cur := '{}'::jsonb; end if;
  users := coalesce(cur -> 'users', '[]'::jsonb);

  if exists (
    select 1 from jsonb_array_elements(users) u
    where lower(u ->> 'email') = lower(p_email)
  ) then
    raise exception 'An account with this email already exists';
  end if;

  users := users || jsonb_build_object(
    'id',          'usr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
    'email',       btrim(p_email),
    'fullName',    btrim(p_full_name),
    'companyName', btrim(coalesce(p_company, '')),
    'phone',       btrim(coalesce(p_phone, '')),
    'address',     btrim(coalesce(p_address, '')),
    'gstin',       btrim(coalesce(p_gstin, '')),
    'role',        'User',
    'status',      'pending',
    'createdAt',   to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  insert into public.app_state (id, data)
  values ('singleton', jsonb_set(cur, '{users}', users))
  on conflict (id) do update
    set data = jsonb_set(coalesce(public.app_state.data, '{}'::jsonb), '{users}', users);
end;
$$;

grant execute on function
  public.register_pending_user(text, text, text, text, text, text)
  to anon, authenticated;
