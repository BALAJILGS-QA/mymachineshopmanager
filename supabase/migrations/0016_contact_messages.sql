-- =============================================================================
-- 0016_contact_messages — public "Contact Us" submissions for the CRM module.
--
-- The marketing site's Contact form writes here; the authenticated app surfaces
-- the rows in Settings → CRM. Anonymous visitors may INSERT only; signed-in app
-- users (the /app portal is already approval-gated in the UI) may read/manage.
-- Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.contact_messages (
  id         text primary key,
  name       text not null,
  email      text not null,
  phone      text,
  company    text,
  message    text not null,
  status     text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

-- Public marketing form may submit (insert only).
drop policy if exists contact_messages_insert on public.contact_messages;
create policy contact_messages_insert
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

-- Signed-in app users may read and manage submissions.
drop policy if exists contact_messages_select on public.contact_messages;
create policy contact_messages_select
  on public.contact_messages for select
  to authenticated
  using (true);

drop policy if exists contact_messages_update on public.contact_messages;
create policy contact_messages_update
  on public.contact_messages for update
  to authenticated
  using (true) with check (true);

drop policy if exists contact_messages_delete on public.contact_messages;
create policy contact_messages_delete
  on public.contact_messages for delete
  to authenticated
  using (true);

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);
