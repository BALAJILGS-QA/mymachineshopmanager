-- 0061_users_registry_rpcs.sql
--
-- SECURITY FIX — residual PII leak in the shared app_state singleton.
--
-- The app_state row (id='singleton') holds the GLOBAL `users` approval registry
-- (email / fullName / companyName / phone / address / gstin / role / status for
-- every registrant) alongside non-sensitive `sequences` counters. Its only RLS
-- policy was `is_app_approved()` FOR ALL, so ANY approved user could SELECT the row
-- and receive every other registrant's details — and could even UPDATE the row
-- (privilege escalation).
--
-- This routes the users registry through scoped SECURITY DEFINER RPCs, gives the
-- non-sensitive sequence counters their own RPCs, and locks the raw app_state table
-- to super admins. All SECURITY DEFINER functions bypass RLS, so the legitimate
-- flows (signup, approvals, role edits, numbering) keep working.
--
-- Idempotent (CREATE OR REPLACE / DROP POLICY IF EXISTS); safe to re-run.

-- 1) Scoped read of the users registry.
--    super admin -> all users; Admin -> own record + approved role='User' accounts
--    in the same company (shop delegation); plain user -> only their own record.
create or replace function public.list_app_users()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_email   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_users   jsonb;
  v_me      jsonb;
  v_role    text;
  v_company text;
begin
  select coalesce(data -> 'users', '[]'::jsonb) into v_users
    from public.app_state where id = 'singleton';
  if v_users is null then
    v_users := '[]'::jsonb;
  end if;

  if public.is_super_admin() then
    return v_users;
  end if;

  select elem into v_me
    from jsonb_array_elements(v_users) elem
    where lower(elem ->> 'email') = v_email
    limit 1;

  if v_me is null then
    return '[]'::jsonb;
  end if;

  v_role    := coalesce(v_me ->> 'role', 'User');
  v_company := lower(btrim(coalesce(v_me ->> 'companyName', '')));

  if v_role = 'Admin' and v_company <> '' then
    return (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from jsonb_array_elements(v_users) elem
      where lower(elem ->> 'email') = v_email
         or ( coalesce(elem ->> 'status', '') = 'approved'
              and coalesce(elem ->> 'role', 'User') = 'User'
              and lower(btrim(coalesce(elem ->> 'companyName', ''))) = v_company )
    );
  end if;

  -- Plain user: only self.
  return jsonb_build_array(v_me);
end $$;

-- 2) Non-sensitive sequence counters (legacy numbering fallback; real numbering is
--    tenant-scoped via next_seq). Readable/writable by any approved user.
create or replace function public.get_app_sequences()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select data -> 'sequences' from public.app_state where id = 'singleton'), '{}'::jsonb);
$$;

create or replace function public.save_app_sequences(p_sequences jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_app_approved() then
    raise exception 'Not authorized';
  end if;
  insert into public.app_state (id, data)
  values ('singleton', jsonb_build_object('sequences', coalesce(p_sequences, '{}'::jsonb)))
  on conflict (id) do update
    set data = jsonb_set(coalesce(public.app_state.data, '{}'::jsonb), '{sequences}', coalesce(p_sequences, '{}'::jsonb)),
        updated_at = now();
end $$;

-- 3) Role / permission edit. Super admin may edit anyone; an Admin may edit only
--    approved role='User' accounts in their own company, and may not grant a role
--    other than 'User'. Returns the updated user record.
create or replace function public.set_user_access(p_id text, p_role text, p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller         text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_is_super       boolean := public.is_super_admin();
  cur              jsonb;
  users            jsonb;
  newusers         jsonb := '[]'::jsonb;
  elem             jsonb;
  v_target         jsonb;
  v_caller_role    text;
  v_caller_company text;
begin
  select data into cur from public.app_state where id = 'singleton' for update;
  if cur is null then
    raise exception 'No app state';
  end if;
  users := coalesce(cur -> 'users', '[]'::jsonb);

  select elem into v_target from jsonb_array_elements(users) elem where elem ->> 'id' = p_id limit 1;
  if v_target is null then
    raise exception 'User not found';
  end if;

  if not v_is_super then
    select elem ->> 'role', lower(btrim(coalesce(elem ->> 'companyName', '')))
      into v_caller_role, v_caller_company
      from jsonb_array_elements(users) elem
      where lower(elem ->> 'email') = v_caller
      limit 1;
    if coalesce(v_caller_role, '') <> 'Admin' then
      raise exception 'Not authorized';
    end if;
    if coalesce(v_target ->> 'role', 'User') <> 'User'
       or lower(btrim(coalesce(v_target ->> 'companyName', ''))) <> v_caller_company
       or lower(v_target ->> 'email') = v_caller then
      raise exception 'Not authorized for this user';
    end if;
    if p_role is not null and p_role <> 'User' then
      raise exception 'Not authorized to grant that role';
    end if;
  end if;

  for elem in select * from jsonb_array_elements(users) loop
    if elem ->> 'id' = p_id then
      if p_role is not null then
        elem := jsonb_set(elem, '{role}', to_jsonb(p_role));
      end if;
      if p_permissions is not null then
        elem := jsonb_set(elem, '{permissions}', p_permissions);
      end if;
      v_target := elem;
    end if;
    newusers := newusers || elem;
  end loop;

  update public.app_state
     set data = jsonb_set(cur, '{users}', newusers), updated_at = now()
   where id = 'singleton';
  return v_target;
end $$;

-- 4) Keep the app_state users-registry status in sync with the approval decision,
--    so the frontend login gate (which reads status) no longer needs to write
--    app_state directly. (Body preserved from the live definition + the new sync.)
create or replace function public.set_user_approval(p_email text, p_approved boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email   text := lower(btrim(p_email));
  v_has_mem boolean;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may change approvals';
  end if;
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  if p_approved then
    insert into public.approved_users (email, role, approved_by)
    values (v_email, 'User', coalesce(auth.jwt() ->> 'email', 'admin'))
    on conflict (email) do update
      set approved_at = now(), approved_by = excluded.approved_by;

    select exists (
      select 1 from public.user_tenant_access
       where lower(email) = v_email and status in ('active','pending')
    ) into v_has_mem;

    if v_has_mem then
      update public.user_tenant_access
         set status = 'active'
       where lower(email) = v_email and status in ('active','pending');
    else
      perform public.provision_isolated_tenant_for(v_email);
    end if;
  else
    delete from public.approved_users where lower(email) = v_email;
    update public.user_tenant_access set status = 'suspended' where lower(email) = v_email;
  end if;

  -- Mirror the decision into the app_state users registry (status + audit fields).
  update public.app_state
     set data = jsonb_set(
           coalesce(data, '{}'::jsonb),
           '{users}',
           (
             select coalesce(jsonb_agg(
               case when lower(elem ->> 'email') = v_email then
                 elem || jsonb_build_object(
                   'status',    case when p_approved then 'approved' else 'rejected' end,
                   'decidedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                   'decidedBy', coalesce(auth.jwt() ->> 'email', 'admin')
                 )
               else elem end
             ), '[]'::jsonb)
             from jsonb_array_elements(coalesce(data -> 'users', '[]'::jsonb)) elem
           )
         ),
         updated_at = now()
   where id = 'singleton';
end $$;

-- 5) Lock the raw app_state table to super admins. Every other access path above is
--    SECURITY DEFINER and bypasses RLS, so this closes direct reads/writes by
--    non-super-admins without breaking signup, approvals, roles or numbering.
drop policy if exists approved_all on public.app_state;
drop policy if exists app_state_superadmin on public.app_state;
create policy app_state_superadmin on public.app_state
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 6) Grants.
grant execute on function public.list_app_users() to authenticated;
grant execute on function public.get_app_sequences() to authenticated;
grant execute on function public.save_app_sequences(jsonb) to authenticated;
grant execute on function public.set_user_access(text, text, jsonb) to authenticated;
