-- ============================================================================
-- Phase 6 - Server-side atomic document numbering
-- ============================================================================
-- Moves document numbering off the client (app_state.data.sequences, which
-- races across concurrent writers) into an atomic Postgres counter. The client
-- keeps its existing pattern formatter (formatDocNo) and just asks the DB for
-- the next integer, so all current number formats are preserved exactly.
--
-- Idempotent + additive. Safe to re-run. No DROP/TRUNCATE.
-- ============================================================================

-- Counter store. RLS enabled with NO policies, so no client role can read/write
-- it directly - only the SECURITY DEFINER functions below (owner rights) touch
-- it. This makes the sequence tamper-proof.
create table if not exists public.doc_counters (
  key   text primary key,
  value bigint not null default 0
);
alter table public.doc_counters enable row level security;

-- Atomically increment and return the next value for a document-number key.
create or replace function public.next_seq(p_key text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v bigint;
begin
  insert into public.doc_counters (key, value)
  values (p_key, 1)
  on conflict (key) do update set value = doc_counters.value + 1
  returning value into v;
  return v;
end;
$$;

-- Peek at the next value WITHOUT consuming it (for next-number hint previews).
create or replace function public.peek_seq(p_key text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.doc_counters where key = p_key), 0) + 1;
$$;

grant execute on function public.next_seq(text) to authenticated;
grant execute on function public.peek_seq(text) to authenticated;

-- Seed counters from the current client-held sequences so numbering continues
-- exactly where it left off. Skips keys not present; never overwrites (re-runs
-- are no-ops).
insert into public.doc_counters (key, value)
select k.key, ((s.data -> 'sequences' ->> k.key))::bigint
from public.app_state s
cross join (values
  ('job'), ('invoice'), ('receipt'), ('issue'), ('adjustment'),
  ('payment'), ('expense'), ('dc'), ('companyCode'), ('materialCode'), ('productCode')
) as k(key)
where s.id = 'singleton'
  and (s.data -> 'sequences' ->> k.key) is not null
on conflict (key) do nothing;

-- Verify:
--   select * from public.doc_counters order by key;
--   select public.peek_seq('job');
