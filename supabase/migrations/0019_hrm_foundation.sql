-- ============================================================================
-- HRM foundation: RBAC (roles/permissions/scopes), notifications, HR audit log,
-- HR settings, and the SQL helpers every later HRM slice depends on.
-- ============================================================================
-- Design notes
--  • Additive + idempotent (create ... if not exists / or replace, on conflict
--    do nothing). Safe to re-run. Touches NO existing table.
--  • Reuses the existing approval gate: is_app_approved() / is_super_admin()
--    (defined in docs/supabase-approval-policy.sql, already in the DB — see
--    0009/0013/0017 which reference it).
--  • Authorization model (per engagement decision "proper HR permission layer"):
--       roles  → HR Admin / HR Manager / Manager / Employee
--       perms  → EMPLOYEE_*, LEAVE_*, PAYROLL_* … (catalog below)
--       scope  → self | team | department | company | all (enforced in RPC+RLS)
--    A user is mapped to a role by EMAIL (matching Supabase Auth JWT email),
--    optionally scoped to a company_id for multi-company HR.
--  • Identity/permission helpers are SECURITY DEFINER so they bypass RLS when
--    reading the RBAC tables — this both avoids policy recursion (a policy that
--    calls is_hr_admin() which itself reads hr_user_roles) and lets the checks
--    run before a user is "approved".
--  • TEXT primary keys (client- or function-generated ids) + timestamptz
--    created_at/updated_at, matching every existing table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- Permission catalog (the fixed set of capabilities HRM understands).
create table if not exists public.hr_permissions (
  key         text primary key,          -- e.g. 'PAYROLL_FINALIZE'
  module      text not null,             -- grouping for settings UI
  label       text not null,
  description text,
  sort        int not null default 0
);

-- Roles (a named bundle of permissions). is_system rows are seeded + protected.
create table if not exists public.hr_roles (
  id          text primary key,          -- e.g. 'role_hr_admin'
  key         text not null unique,      -- e.g. 'hr_admin'
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Role → permission grants, each carrying the data-access scope for that grant.
create table if not exists public.hr_role_permissions (
  role_id        text not null references public.hr_roles(id) on delete cascade,
  permission_key text not null references public.hr_permissions(key) on delete cascade,
  scope          text not null default 'all'
                 check (scope in ('self','team','department','company','all')),
  primary key (role_id, permission_key)
);

-- User (by email) → role assignment, optionally scoped to a single company.
-- company_id NULL = the role applies across all companies.
create table if not exists public.hr_user_roles (
  id         text primary key,
  email      text not null,
  role_id    text not null references public.hr_roles(id) on delete cascade,
  company_id text references public.companies(id),
  created_at timestamptz not null default now(),
  created_by text
);
create unique index if not exists idx_hr_user_roles_uniq
  on public.hr_user_roles (lower(email), role_id, coalesce(company_id, '*'));
create index if not exists idx_hr_user_roles_email on public.hr_user_roles (lower(email));

-- HR settings singleton (employee-code pattern, attendance/leave/payroll rules …).
-- Kept as a JSON blob like app_state so config is extensible without migrations.
create table if not exists public.hr_settings (
  id         text primary key default 'singleton',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.hr_settings (id, data) values ('singleton', '{}'::jsonb)
  on conflict (id) do nothing;

-- Persistent, per-recipient notifications (the app had only transient toasts).
-- Generic enough for the whole app; HRM is the first producer.
create table if not exists public.notifications (
  id              text primary key,
  recipient_email text not null,
  type            text not null,          -- 'leave.submitted', 'payroll.finalized' …
  title           text not null,
  body            text,
  entity          text,                   -- 'leave_application' …
  entity_id       text,
  link            text,                   -- in-app route to open
  is_read         boolean not null default false,
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index if not exists idx_notifications_recipient
  on public.notifications (lower(recipient_email), is_read, created_at desc);

-- Rich HR audit log (actor + before/after). The existing audit_log table is
-- client-written, actor-less and minimal; HR actions need attributed,
-- diff-bearing, server-written entries — so this is a distinct, richer log
-- rather than a duplicate of the same capability.
create table if not exists public.hr_audit_log (
  id         text primary key,
  at         timestamptz not null default now(),
  actor_email text,
  actor_name text,
  action     text not null,              -- 'create' | 'update' | 'delete' | 'approve' | 'finalize' …
  entity     text not null,             -- 'employee' | 'payroll_run' …
  entity_id  text,
  company_id text,
  summary    text,
  before     jsonb,
  after      jsonb,
  ip         text,
  meta       jsonb
);
create index if not exists idx_hr_audit_entity on public.hr_audit_log (entity, entity_id);
create index if not exists idx_hr_audit_at on public.hr_audit_log (at desc);

-- ---------------------------------------------------------------------------
-- 2. Identity + permission helpers (SECURITY DEFINER → bypass RLS, no recursion)
-- ---------------------------------------------------------------------------

create or replace function public.hr_current_email()
returns text language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Broadest scope wins when a user holds a permission via several roles.
create or replace function public.hr_scope_rank(p_scope text)
returns int language sql immutable as $$
  select case p_scope
    when 'all' then 5 when 'company' then 4 when 'department' then 3
    when 'team' then 2 when 'self' then 1 else 0 end;
$$;

-- True when the caller has the given permission (optionally within a company).
-- Super admins always pass. A NULL-company grant applies to every company.
create or replace function public.hr_has_permission(p_key text, p_company_id text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (
        select 1
        from public.hr_user_roles ur
        join public.hr_role_permissions rp on rp.role_id = ur.role_id
        where lower(ur.email) = public.hr_current_email()
          and rp.permission_key = p_key
          and (ur.company_id is null or p_company_id is null or ur.company_id = p_company_id)
      );
$$;

-- The broadest scope the caller has for a permission ('all' for super admins),
-- or NULL when they don't hold it at all.
create or replace function public.hr_permission_scope(p_key text, p_company_id text default null)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.is_super_admin() then 'all'
    else (
      select rp.scope
      from public.hr_user_roles ur
      join public.hr_role_permissions rp on rp.role_id = ur.role_id
      where lower(ur.email) = public.hr_current_email()
        and rp.permission_key = p_key
        and (ur.company_id is null or p_company_id is null or ur.company_id = p_company_id)
      order by public.hr_scope_rank(rp.scope) desc
      limit 1
    )
  end;
$$;

create or replace function public.is_hr_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (
        select 1 from public.hr_user_roles ur
        join public.hr_roles r on r.id = ur.role_id
        where lower(ur.email) = public.hr_current_email() and r.key = 'hr_admin'
      );
$$;

-- Everything the caller can do, one row per permission at its broadest scope.
-- The frontend usePermissions() hook consumes this.
create or replace function public.hr_my_access()
returns table (permission_key text, scope text)
language sql stable security definer set search_path = public as $$
  select p.key,
         case when public.is_super_admin() then 'all' else 'all' end as scope
  from public.hr_permissions p
  where public.is_super_admin()
  union
  select rp.permission_key,
         (array_agg(rp.scope order by public.hr_scope_rank(rp.scope) desc))[1] as scope
  from public.hr_user_roles ur
  join public.hr_role_permissions rp on rp.role_id = ur.role_id
  where lower(ur.email) = public.hr_current_email()
  group by rp.permission_key;
$$;

-- ---------------------------------------------------------------------------
-- 3. Write helpers (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

-- Attributed audit entry. Actor is taken from the JWT, never trusted from input.
create or replace function public.hr_log(
  p_action text, p_entity text, p_entity_id text, p_summary text default null,
  p_before jsonb default null, p_after jsonb default null,
  p_company_id text default null, p_meta jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_email text := public.hr_current_email();
begin
  insert into public.hr_audit_log
    (id, actor_email, action, entity, entity_id, company_id, summary, before, after, meta)
  values
    ('hra_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
     v_email, p_action, p_entity, p_entity_id, p_company_id, p_summary, p_before, p_after, p_meta);
end;
$$;

-- Create a notification for a recipient (used by later leave/payroll RPCs).
create or replace function public.hr_notify(
  p_recipient_email text, p_type text, p_title text, p_body text default null,
  p_entity text default null, p_entity_id text default null, p_link text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(btrim(p_recipient_email), '') = '' then return; end if;
  insert into public.notifications
    (id, recipient_email, type, title, body, entity, entity_id, link)
  values
    ('ntf_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
     lower(p_recipient_email), p_type, p_title, p_body, p_entity, p_entity_id, p_link);
end;
$$;

-- Assign / revoke a role (HR-admin or super-admin only). Audited.
create or replace function public.hr_assign_role(
  p_email text, p_role_key text, p_company_id text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_role_id text;
begin
  if not public.is_hr_admin() then raise exception 'Not authorized to assign roles'; end if;
  if coalesce(btrim(p_email), '') = '' then raise exception 'Email is required'; end if;
  select id into v_role_id from public.hr_roles where key = p_role_key;
  if v_role_id is null then raise exception 'Unknown role %', p_role_key; end if;
  insert into public.hr_user_roles (id, email, role_id, company_id, created_by)
  values ('hur_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
          lower(p_email), v_role_id, p_company_id, public.hr_current_email())
  on conflict (lower(email), role_id, coalesce(company_id, '*')) do nothing;
  perform public.hr_log('assign_role', 'hr_user_role', lower(p_email),
    'Assigned role ' || p_role_key, null,
    jsonb_build_object('role', p_role_key, 'company_id', p_company_id), p_company_id);
end;
$$;

create or replace function public.hr_revoke_role(
  p_email text, p_role_key text, p_company_id text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_role_id text;
begin
  if not public.is_hr_admin() then raise exception 'Not authorized to revoke roles'; end if;
  select id into v_role_id from public.hr_roles where key = p_role_key;
  if v_role_id is null then raise exception 'Unknown role %', p_role_key; end if;
  delete from public.hr_user_roles
  where lower(email) = lower(p_email) and role_id = v_role_id
    and coalesce(company_id, '*') = coalesce(p_company_id, '*');
  perform public.hr_log('revoke_role', 'hr_user_role', lower(p_email),
    'Revoked role ' || p_role_key, null,
    jsonb_build_object('role', p_role_key, 'company_id', p_company_id), p_company_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------

-- Catalog + roles + grants: readable by any approved user (needed to render the
-- settings UI); writable only by HR admins.
do $$
declare t text;
begin
  foreach t in array array['hr_permissions','hr_roles','hr_role_permissions','hr_settings']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists hr_read on public.%I;', t);
    execute format('create policy hr_read on public.%I for select to authenticated using (public.is_app_approved());', t);
    execute format('drop policy if exists hr_write on public.%I;', t);
    execute format('create policy hr_write on public.%I for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());', t);
  end loop;
end $$;

-- User→role mapping: a user may read their own rows; HR admins manage all.
alter table public.hr_user_roles enable row level security;
drop policy if exists hr_user_roles_read on public.hr_user_roles;
create policy hr_user_roles_read on public.hr_user_roles for select to authenticated
  using (public.is_hr_admin() or lower(email) = public.hr_current_email());
drop policy if exists hr_user_roles_write on public.hr_user_roles;
create policy hr_user_roles_write on public.hr_user_roles for all to authenticated
  using (public.is_hr_admin()) with check (public.is_hr_admin());

-- Notifications: a recipient sees + updates (mark-read) only their own; HR admins
-- see all. Inserts happen through hr_notify() (SECURITY DEFINER), so no INSERT
-- policy is granted to end users.
alter table public.notifications enable row level security;
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (public.is_hr_admin() or lower(recipient_email) = public.hr_current_email());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (lower(recipient_email) = public.hr_current_email() or public.is_hr_admin())
  with check (lower(recipient_email) = public.hr_current_email() or public.is_hr_admin());

-- HR audit log: visible to holders of AUDIT_VIEW (or HR admins). Written only
-- via hr_log() (SECURITY DEFINER) — no end-user INSERT policy.
alter table public.hr_audit_log enable row level security;
drop policy if exists hr_audit_read on public.hr_audit_log;
create policy hr_audit_read on public.hr_audit_log for select to authenticated
  using (public.is_hr_admin() or public.hr_has_permission('AUDIT_VIEW'));

-- ---------------------------------------------------------------------------
-- 5. Seed — permission catalog
-- ---------------------------------------------------------------------------
insert into public.hr_permissions (key, module, label, description, sort) values
  ('HRM_VIEW',            'General',      'View HR module',        'Access the HRM area and dashboard', 10),
  ('EMPLOYEE_VIEW',       'Employees',    'View employees',        null, 20),
  ('EMPLOYEE_CREATE',     'Employees',    'Create employees',      null, 21),
  ('EMPLOYEE_EDIT',       'Employees',    'Edit employees',        null, 22),
  ('EMPLOYEE_ARCHIVE',    'Employees',    'Archive employees',     null, 23),
  ('DEPARTMENT_MANAGE',   'Organization', 'Manage departments',    null, 30),
  ('DESIGNATION_MANAGE',  'Organization', 'Manage designations',   null, 31),
  ('ORG_VIEW',            'Organization', 'View org structure',    null, 32),
  ('ATTENDANCE_VIEW',     'Attendance',   'View attendance',       null, 40),
  ('ATTENDANCE_EDIT',     'Attendance',   'Edit attendance',       null, 41),
  ('ATTENDANCE_APPROVE',  'Attendance',   'Approve attendance',    null, 42),
  ('SHIFT_MANAGE',        'Attendance',   'Manage shifts',         null, 43),
  ('LEAVE_VIEW',          'Leave',        'View leave',            null, 50),
  ('LEAVE_APPLY',         'Leave',        'Apply for leave',       null, 51),
  ('LEAVE_APPROVE',       'Leave',        'Approve leave',         null, 52),
  ('LEAVE_REJECT',        'Leave',        'Reject leave',          null, 53),
  ('HOLIDAY_MANAGE',      'Leave',        'Manage holidays',       null, 54),
  ('PAYROLL_VIEW',        'Payroll',      'View payroll',          null, 60),
  ('PAYROLL_PROCESS',     'Payroll',      'Process payroll',       null, 61),
  ('PAYROLL_APPROVE',     'Payroll',      'Approve payroll',       null, 62),
  ('PAYROLL_FINALIZE',    'Payroll',      'Finalize/lock payroll', null, 63),
  ('DOCUMENT_VIEW',       'Documents',    'View documents',        null, 70),
  ('DOCUMENT_UPLOAD',     'Documents',    'Upload documents',      null, 71),
  ('DOCUMENT_DELETE',     'Documents',    'Delete documents',      null, 72),
  ('ASSET_MANAGE',        'Assets',       'Manage assets',         null, 80),
  ('ADVANCE_MANAGE',      'Finance',      'Manage advances',       null, 90),
  ('EXPENSE_VIEW',        'Finance',      'View expense claims',   null, 91),
  ('EXPENSE_APPROVE',     'Finance',      'Approve expense claims',null, 92),
  ('RECRUITMENT_VIEW',    'Recruitment',  'View recruitment',      null, 100),
  ('RECRUITMENT_MANAGE',  'Recruitment',  'Manage recruitment',    null, 101),
  ('PERFORMANCE_VIEW',    'Performance',  'View performance',      null, 110),
  ('PERFORMANCE_MANAGE',  'Performance',  'Manage performance',    null, 111),
  ('TRAINING_VIEW',       'Training',     'View training',         null, 120),
  ('TRAINING_MANAGE',     'Training',     'Manage training',       null, 121),
  ('REPORT_VIEW',         'Reports',      'View HR reports',       null, 130),
  ('REPORT_EXPORT',       'Reports',      'Export HR reports',     null, 131),
  ('HR_SETTINGS_MANAGE',  'Settings',     'Manage HR settings',    null, 140),
  ('ROLE_MANAGE',         'Settings',     'Manage roles & access', null, 141),
  ('AUDIT_VIEW',          'Settings',     'View HR audit log',     null, 142)
on conflict (key) do update
  set module = excluded.module, label = excluded.label,
      description = excluded.description, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- 6. Seed — default roles
-- ---------------------------------------------------------------------------
insert into public.hr_roles (id, key, name, description, is_system) values
  ('role_hr_admin',   'hr_admin',   'HR Admin',   'Full HR access, including settings and roles', true),
  ('role_hr_manager', 'hr_manager', 'HR Manager', 'Runs day-to-day HR across the company',        true),
  ('role_manager',    'manager',    'Manager',    'Approves attendance/leave for their team',     true),
  ('role_employee',   'employee',   'Employee',   'Self-service: own profile, leave, payslips',   true)
on conflict (id) do update
  set name = excluded.name, description = excluded.description, is_system = true;

-- ---------------------------------------------------------------------------
-- 7. Seed — role → permission grants (with scopes)
-- ---------------------------------------------------------------------------

-- HR Admin: every permission, org-wide.
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_admin', key, 'all' from public.hr_permissions
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- HR Manager: everything operational at company scope, minus role/settings admin
-- and payroll finalize (kept with HR Admin as the four-eyes control).
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_manager', key, 'company' from public.hr_permissions
  where key not in ('ROLE_MANAGE','HR_SETTINGS_MANAGE','PAYROLL_FINALIZE')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- Manager: team-scoped visibility + approvals.
insert into public.hr_role_permissions (role_id, permission_key, scope) values
  ('role_manager','HRM_VIEW','team'),
  ('role_manager','EMPLOYEE_VIEW','team'),
  ('role_manager','ORG_VIEW','team'),
  ('role_manager','ATTENDANCE_VIEW','team'),
  ('role_manager','ATTENDANCE_EDIT','team'),
  ('role_manager','ATTENDANCE_APPROVE','team'),
  ('role_manager','LEAVE_VIEW','team'),
  ('role_manager','LEAVE_APPROVE','team'),
  ('role_manager','LEAVE_REJECT','team'),
  ('role_manager','EXPENSE_VIEW','team'),
  ('role_manager','EXPENSE_APPROVE','team'),
  ('role_manager','PERFORMANCE_VIEW','team'),
  ('role_manager','PERFORMANCE_MANAGE','team'),
  ('role_manager','TRAINING_VIEW','team'),
  ('role_manager','REPORT_VIEW','team')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- Employee: self-service only.
insert into public.hr_role_permissions (role_id, permission_key, scope) values
  ('role_employee','HRM_VIEW','self'),
  ('role_employee','EMPLOYEE_VIEW','self'),
  ('role_employee','ATTENDANCE_VIEW','self'),
  ('role_employee','LEAVE_VIEW','self'),
  ('role_employee','LEAVE_APPLY','self'),
  ('role_employee','DOCUMENT_VIEW','self'),
  ('role_employee','PAYROLL_VIEW','self'),
  ('role_employee','TRAINING_VIEW','self')
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.hr_current_email() to authenticated;
grant execute on function public.hr_scope_rank(text) to authenticated;
grant execute on function public.hr_has_permission(text, text) to authenticated;
grant execute on function public.hr_permission_scope(text, text) to authenticated;
grant execute on function public.is_hr_admin() to authenticated;
grant execute on function public.hr_my_access() to authenticated;
grant execute on function public.hr_log(text, text, text, text, jsonb, jsonb, text, jsonb) to authenticated;
grant execute on function public.hr_notify(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.hr_assign_role(text, text, text) to authenticated;
grant execute on function public.hr_revoke_role(text, text, text) to authenticated;
