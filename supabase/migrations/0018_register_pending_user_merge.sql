-- =============================================================================
-- 0018_register_pending_user_merge — enrich the applicant profile on sign-up.
--
-- A trigger (handle_new_auth_user) already inserts a bare pending user (email
-- only) into app_state.data.users when the auth account is created. The original
-- client then tried to UPDATE that row with the form details (full name, company,
-- phone, address, GSTIN) via a direct app_state write, which RLS blocked — so
-- those fields were lost. This replaces register_pending_user so it MERGES the
-- profile fields into the existing (trigger-created) row, or inserts a pending
-- row if none exists. Status is never downgraded, so an approved account can't be
-- re-opened. SECURITY DEFINER: runs as owner, bypassing app_state RLS.
-- Idempotent: safe to re-run.
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
  cur      jsonb;
  users    jsonb;
  newusers jsonb := '[]'::jsonb;
  elem     jsonb;
  found    boolean := false;
  profile  jsonb;
begin
  if coalesce(btrim(p_email), '') = '' then
    raise exception 'Email is required';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'Full name is required';
  end if;

  profile := jsonb_build_object(
    'fullName',    btrim(p_full_name),
    'companyName', btrim(coalesce(p_company, '')),
    'phone',       btrim(coalesce(p_phone, '')),
    'address',     btrim(coalesce(p_address, '')),
    'gstin',       btrim(coalesce(p_gstin, ''))
  );

  select data into cur from public.app_state where id = 'singleton' for update;
  if cur is null then cur := '{}'::jsonb; end if;
  users := coalesce(cur -> 'users', '[]'::jsonb);

  for elem in select * from jsonb_array_elements(users) loop
    if lower(elem ->> 'email') = lower(p_email) then
      found := true;
      -- Merge form details into the existing (trigger-created) row.
      elem := elem || profile;
      if not (elem ? 'status') or coalesce(elem ->> 'status', '') = '' then
        elem := elem || jsonb_build_object('status', 'pending');
      end if;
      if not (elem ? 'role') then
        elem := elem || jsonb_build_object('role', 'User');
      end if;
    end if;
    newusers := newusers || elem;
  end loop;

  if not found then
    newusers := newusers || (
      profile || jsonb_build_object(
        'id',        'usr_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
        'email',     btrim(p_email),
        'role',      'User',
        'status',    'pending',
        'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    );
  end if;

  insert into public.app_state (id, data)
  values ('singleton', jsonb_set(cur, '{users}', newusers))
  on conflict (id) do update
    set data = jsonb_set(coalesce(public.app_state.data, '{}'::jsonb), '{users}', newusers);
end;
$$;

grant execute on function
  public.register_pending_user(text, text, text, text, text, text)
  to anon, authenticated;
