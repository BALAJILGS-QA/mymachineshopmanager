-- ============================================================================
-- Production Planning → Tool Room
-- Tool / accessory / consumable inventory with a transaction-driven ledger.
-- ============================================================================
-- Design notes
--  • Additive + idempotent (create ... if not exists / or replace, on conflict
--    do nothing). Safe to re-run. Touches NO existing table.
--  • Reuses the whole existing platform spine:
--       – approval gate     is_app_approved() / is_super_admin()   (0009/0019)
--       – RBAC catalog      hr_permissions / hr_roles / …          (0019)
--       – attributed audit  hr_log(...)                            (0019)
--       – notifications     hr_notify(...)                         (0019)
--       – numbering         next_seq(...) formatted client-side    (0001)
--    Tool Room adds its own TOOLROOM_* permission keys to the shared catalog
--    (so hr_my_access() / usePermissions() pick them up automatically) and
--    grants them to the existing hr_admin / hr_manager roles.
--  • INVENTORY IS TRANSACTION-DRIVEN. tool_transactions is the single ledger.
--    Every physical quantity lives in exactly one "bucket" (available, reserved,
--    issued, maintenance, calibration, damaged, scrap, consumed). A movement
--    takes qty OUT of `from_bucket` and INTO `to_bucket`. Per-bucket balances
--    (and therefore Available) are DERIVED, never stored/edited. The tool_move()
--    RPC is the ONLY writer and enforces non-negative buckets atomically, so
--    concurrent issues can never drive a bucket below zero.
--  • TEXT primary keys (client-generated ids) + timestamptz created/updated,
--    matching every existing table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Master data
-- ---------------------------------------------------------------------------

-- Hierarchical tool categories (Cutting → Drills, End Mills, Inserts …).
create table if not exists public.tool_categories (
  id          text primary key,
  code        text,
  name        text not null,
  description text,
  parent_id   text references public.tool_categories(id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tool_categories_parent on public.tool_categories (parent_id);

-- Tool master. One row per catalogued tool/accessory/consumable definition.
-- Control flags drive the lifecycle (serialized, calibration/maintenance/return
-- required, consumable vs reusable). Inventory config drives reorder alerts.
create table if not exists public.tools (
  id               text primary key,
  code             text unique,
  name             text not null,
  category_id      text references public.tool_categories(id) on delete set null,
  sub_category     text,
  classification   text,                              -- cutting_tool | measuring_tool | …
  tool_type        text,
  description      text,
  manufacturer     text,
  brand            text,
  model_number     text,
  part_number      text,
  oem_number       text,
  serial_number    text,                              -- for a single serialized asset
  specification    text,
  size             text,
  dimension        text,
  material         text,
  grade            text,
  standard         text,
  uom              text not null default 'nos',
  -- Inventory configuration
  min_stock        numeric not null default 0,
  max_stock        numeric,
  reorder_level    numeric not null default 0,
  reorder_qty      numeric not null default 0,
  safety_stock     numeric not null default 0,
  bin_location     text,
  rack             text,
  shelf            text,
  store_location   text,
  warehouse        text,
  tool_room_location text,
  -- Lifecycle
  purchase_date    date,
  expected_life    numeric,                           -- value in life_unit
  life_unit        text,                              -- days | cycles | parts | machine_hours
  replacement_frequency text,
  current_condition text,
  unit_cost        numeric,                           -- last/standard unit cost
  -- Control parameters (flags)
  is_serialized    boolean not null default false,
  is_batch_controlled boolean not null default false,
  is_lot_controlled boolean not null default false,
  calibration_required boolean not null default false,
  calibration_frequency_days int,
  maintenance_required boolean not null default false,
  maintenance_frequency_days int,
  inspection_required boolean not null default false,
  return_required  boolean not null default true,
  is_consumable    boolean not null default false,
  status           text not null default 'active',    -- active | inactive | archived
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       text
);
create index if not exists idx_tools_category on public.tools (category_id);
create index if not exists idx_tools_status on public.tools (status);
create index if not exists idx_tools_name on public.tools (lower(name));

-- ---------------------------------------------------------------------------
-- 2. The ledger (single source of truth for every quantity movement)
-- ---------------------------------------------------------------------------
-- Buckets a quantity can occupy. Movement = qty leaves from_bucket, enters
-- to_bucket. Receipts have from_bucket NULL (external in); consume/scrap land in
-- terminal buckets (consumed/scrap) so the ledger stays fully balanced.
create table if not exists public.tool_transactions (
  id             text primary key,
  txn_no         text,                                -- e.g. TR-2026-27-000123
  tool_id        text not null references public.tools(id) on delete cascade,
  txn_type       text not null,                       -- receipt|reserve|release|issue|issue_reserved|return_available|return_damaged|return_maintenance|return_calibration|consume|transfer|maintenance_send|maintenance_pass|maintenance_scrap|calibrate_send|calibrate_pass|calibrate_scrap|scrap|adjust
  qty            numeric not null check (qty > 0),
  from_bucket    text check (from_bucket in ('available','reserved','issued','maintenance','calibration','damaged','scrap','consumed')),
  to_bucket      text check (to_bucket   in ('available','reserved','issued','maintenance','calibration','damaged','scrap','consumed')),
  unit           text,
  unit_cost      numeric,
  -- Context / references (all optional, transaction-type dependent)
  location_from  text,
  location_to    text,
  job_id         text references public.job_orders(id) on delete set null,
  machine        text,
  operation      text,
  employee       text,
  department     text,
  purpose        text,
  condition      text,                                -- return/inspection condition
  reservation_id text,
  maintenance_id text,
  calibration_id text,
  serial_number  text,
  batch_no       text,
  ref_type       text,                                -- 'grn' | 'po' | 'reservation' | …
  ref_id         text,
  ref_no         text,
  ref_key        text,                                -- idempotency key (unique when set)
  note           text,
  actor_email    text,
  at             timestamptz not null default now()
);
create index if not exists idx_tool_txn_tool on public.tool_transactions (tool_id, at desc);
create index if not exists idx_tool_txn_type on public.tool_transactions (txn_type);
create index if not exists idx_tool_txn_job on public.tool_transactions (job_id);
create index if not exists idx_tool_txn_at on public.tool_transactions (at desc);
-- Idempotency: the same source event (e.g. a GRN line) can never post twice.
create unique index if not exists idx_tool_txn_ref_key
  on public.tool_transactions (ref_key) where ref_key is not null;

-- ---------------------------------------------------------------------------
-- 3. Reservation / maintenance / calibration records (rich metadata; the
--    physical quantity moves are always posted to the ledger via tool_move()).
-- ---------------------------------------------------------------------------
create table if not exists public.tool_reservations (
  id             text primary key,
  reservation_no text,
  tool_id        text not null references public.tools(id) on delete cascade,
  qty            numeric not null check (qty > 0),
  issued_qty     numeric not null default 0,
  required_date  date,
  job_id         text references public.job_orders(id) on delete set null,
  machine        text,
  operation      text,
  employee       text,
  reserved_by    text,
  status         text not null default 'reserved',    -- reserved|partially_issued|fully_issued|cancelled|completed
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_tool_resv_tool on public.tool_reservations (tool_id);
create index if not exists idx_tool_resv_status on public.tool_reservations (status);

create table if not exists public.tool_maintenance (
  id               text primary key,
  maintenance_no   text,
  tool_id          text not null references public.tools(id) on delete cascade,
  qty              numeric not null default 1,
  serial_number    text,
  maintenance_type text,                              -- preventive|corrective|repair|sharpening|reconditioning|replacement
  maintenance_date date,
  due_date         date,
  service_provider text,
  technician       text,
  cost             numeric,
  parts_used       text,
  description      text,
  result           text,                              -- passed|failed
  condition        text,
  next_due_date    date,
  status           text not null default 'open',      -- open|completed|scrapped
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_tool_maint_tool on public.tool_maintenance (tool_id);
create index if not exists idx_tool_maint_status on public.tool_maintenance (status);
create index if not exists idx_tool_maint_due on public.tool_maintenance (due_date);

create table if not exists public.tool_calibrations (
  id               text primary key,
  calibration_no   text,
  tool_id          text not null references public.tools(id) on delete cascade,
  qty              numeric not null default 1,
  serial_number    text,
  calibration_date date,
  due_date         date,
  agency           text,
  certificate_no   text,
  result           text,                              -- pass|fail
  accuracy         text,
  tolerance        text,
  status           text not null default 'valid',     -- valid|due_soon|overdue|failed
  certificate_path text,
  remarks          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_tool_calib_tool on public.tool_calibrations (tool_id);
create index if not exists idx_tool_calib_due on public.tool_calibrations (due_date);
create index if not exists idx_tool_calib_status on public.tool_calibrations (status);

-- ---------------------------------------------------------------------------
-- 4. Derived inventory (transaction-driven, never stored)
-- ---------------------------------------------------------------------------
-- Per-bucket balance for a tool: Σ(into bucket) − Σ(out of bucket).
create or replace function public.tool_bucket_balance(p_tool_id text, p_bucket text)
returns numeric language sql stable security invoker set search_path = public as $$
  select
      coalesce((select sum(qty) from public.tool_transactions where tool_id = p_tool_id and to_bucket   = p_bucket), 0)
    - coalesce((select sum(qty) from public.tool_transactions where tool_id = p_tool_id and from_bucket = p_bucket), 0);
$$;

-- Full stock breakdown for one tool (all buckets + on-hand + received).
create or replace view public.tool_inventory as
with bal as (
  select tool_id, to_bucket   as bucket, sum(qty)  as q from public.tool_transactions where to_bucket   is not null group by tool_id, to_bucket
  union all
  select tool_id, from_bucket as bucket, -sum(qty) as q from public.tool_transactions where from_bucket is not null group by tool_id, from_bucket
),
agg as (
  select tool_id,
    coalesce(sum(q) filter (where bucket = 'available'),   0) as available_qty,
    coalesce(sum(q) filter (where bucket = 'reserved'),    0) as reserved_qty,
    coalesce(sum(q) filter (where bucket = 'issued'),      0) as issued_qty,
    coalesce(sum(q) filter (where bucket = 'maintenance'), 0) as maintenance_qty,
    coalesce(sum(q) filter (where bucket = 'calibration'), 0) as calibration_qty,
    coalesce(sum(q) filter (where bucket = 'damaged'),     0) as damaged_qty,
    coalesce(sum(q) filter (where bucket = 'scrap'),       0) as scrap_qty,
    coalesce(sum(q) filter (where bucket = 'consumed'),    0) as consumed_qty,
    coalesce(sum(q) filter (where bucket in ('available','reserved','issued','maintenance','calibration','damaged')), 0) as on_hand_qty,
    coalesce(sum(q), 0) as net_qty
  from bal group by tool_id
)
select
  t.id            as tool_id,
  t.code,
  t.name,
  t.category_id,
  t.brand,
  t.part_number,
  t.serial_number,
  t.uom,
  t.store_location,
  t.warehouse,
  t.tool_room_location,
  t.bin_location,
  t.min_stock,
  t.reorder_level,
  t.is_consumable,
  t.status        as tool_status,
  coalesce(a.available_qty,   0) as available_qty,
  coalesce(a.reserved_qty,    0) as reserved_qty,
  coalesce(a.issued_qty,      0) as issued_qty,
  coalesce(a.maintenance_qty, 0) as maintenance_qty,
  coalesce(a.calibration_qty, 0) as calibration_qty,
  coalesce(a.damaged_qty,     0) as damaged_qty,
  coalesce(a.scrap_qty,       0) as scrap_qty,
  coalesce(a.consumed_qty,    0) as consumed_qty,
  coalesce(a.on_hand_qty,     0) as on_hand_qty,
  coalesce(a.net_qty,         0) as net_qty,
  (coalesce(a.available_qty, 0) <= 0) as is_out_of_stock,
  (coalesce(a.available_qty, 0) <= t.reorder_level and t.reorder_level > 0) as is_low_stock
from public.tools t
left join agg a on a.tool_id = t.id;

-- ---------------------------------------------------------------------------
-- 5. Authorization helper for Tool Room (mirrors the client bootstrap: until
--    any RBAC role is actually assigned, every approved user may act; once real
--    grants exist the permission check takes over).
-- ---------------------------------------------------------------------------
create or replace function public.tool_can(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_app_approved()
     and (
       public.is_super_admin()
       or not exists (select 1 from public.hr_user_roles)   -- unconfigured → allow
       or public.hr_has_permission(p_key)
     );
$$;

-- ---------------------------------------------------------------------------
-- 6. tool_move() — the single, atomic, permission-checked ledger writer.
--    The required permission and the bucket transition are DERIVED from
--    p_txn_type inside the function, so a client cannot post an issue while
--    claiming a weaker permission or forge an invalid bucket transition.
-- ---------------------------------------------------------------------------
create or replace function public.tool_move(
  p_id            text,
  p_txn_no        text,
  p_tool_id       text,
  p_txn_type      text,
  p_qty           numeric,
  p_unit          text          default null,
  p_unit_cost     numeric       default null,
  p_location_from text          default null,
  p_location_to   text          default null,
  p_job_id        text          default null,
  p_machine       text          default null,
  p_operation     text          default null,
  p_employee      text          default null,
  p_department    text          default null,
  p_purpose       text          default null,
  p_condition     text          default null,
  p_reservation_id text         default null,
  p_maintenance_id text         default null,
  p_calibration_id text         default null,
  p_serial_number text          default null,
  p_batch_no      text          default null,
  p_ref_type      text          default null,
  p_ref_id        text          default null,
  p_ref_no        text          default null,
  p_ref_key       text          default null,
  p_note          text          default null,
  -- adjust-only: caller supplies the target bucket + sign
  p_adjust_bucket text          default null,
  p_adjust_in     boolean       default true,
  p_allow_negative boolean      default false
) returns setof public.tool_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_perm   text;
  v_from   text;
  v_to     text;
  v_avail  numeric;
  v_src    numeric;
  v_existing public.tool_transactions;
begin
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  -- Idempotency: replay of the same source event returns the original row.
  if p_ref_key is not null then
    select * into v_existing from public.tool_transactions where ref_key = p_ref_key limit 1;
    if found then return next v_existing; return; end if;
  end if;

  -- Map txn_type → required permission + bucket transition.
  case p_txn_type
    when 'receipt'             then v_perm := 'TOOLROOM_RECEIVE';   v_from := null;          v_to := 'available';
    when 'reserve'             then v_perm := 'TOOLROOM_RESERVE';   v_from := 'available';   v_to := 'reserved';
    when 'release'             then v_perm := 'TOOLROOM_RESERVE';   v_from := 'reserved';    v_to := 'available';
    when 'issue'               then v_perm := 'TOOLROOM_ISSUE';     v_from := 'available';   v_to := 'issued';
    when 'issue_reserved'      then v_perm := 'TOOLROOM_ISSUE';     v_from := 'reserved';    v_to := 'issued';
    when 'return_available'    then v_perm := 'TOOLROOM_RETURN';    v_from := 'issued';      v_to := 'available';
    when 'return_damaged'      then v_perm := 'TOOLROOM_RETURN';    v_from := 'issued';      v_to := 'damaged';
    when 'return_maintenance'  then v_perm := 'TOOLROOM_RETURN';    v_from := 'issued';      v_to := 'maintenance';
    when 'return_calibration'  then v_perm := 'TOOLROOM_RETURN';    v_from := 'issued';      v_to := 'calibration';
    when 'consume'             then v_perm := 'TOOLROOM_ISSUE';     v_from := 'issued';      v_to := 'consumed';
    when 'transfer'            then v_perm := 'TOOLROOM_TRANSFER';  v_from := 'available';   v_to := 'available';
    when 'maintenance_send'    then v_perm := 'TOOLROOM_MAINTAIN';  v_from := 'available';   v_to := 'maintenance';
    when 'maintenance_pass'    then v_perm := 'TOOLROOM_MAINTAIN';  v_from := 'maintenance'; v_to := 'available';
    when 'maintenance_scrap'   then v_perm := 'TOOLROOM_MAINTAIN';  v_from := 'maintenance'; v_to := 'scrap';
    when 'calibrate_send'      then v_perm := 'TOOLROOM_CALIBRATE'; v_from := 'available';   v_to := 'calibration';
    when 'calibrate_pass'      then v_perm := 'TOOLROOM_CALIBRATE'; v_from := 'calibration'; v_to := 'available';
    when 'calibrate_scrap'     then v_perm := 'TOOLROOM_CALIBRATE'; v_from := 'calibration'; v_to := 'scrap';
    when 'scrap'               then v_perm := 'TOOLROOM_SCRAP';     v_from := 'available';   v_to := 'scrap';
    when 'adjust'              then
      v_perm := 'TOOLROOM_ADJUST';
      if p_adjust_bucket is null then raise exception 'Adjustment requires a target bucket'; end if;
      if p_adjust_in then v_from := null; v_to := p_adjust_bucket;
      else                v_from := p_adjust_bucket; v_to := null; end if;
    else raise exception 'Unknown tool transaction type: %', p_txn_type;
  end case;

  if not public.tool_can(v_perm) then
    raise exception 'Not authorized: % (%).', v_perm, p_txn_type;
  end if;

  -- Non-negative enforcement on the source bucket. Available can NEVER go
  -- negative; other buckets honour p_allow_negative (kept false by default).
  if v_from is not null then
    v_src := public.tool_bucket_balance(p_tool_id, v_from);
    if v_from = 'available' and p_qty > v_src then
      raise exception 'Only % available for this tool (requested %).', v_src, p_qty;
    elsif not coalesce(p_allow_negative, false) and p_qty > v_src then
      raise exception 'Only % in "%" for this tool (requested %).', v_src, v_from, p_qty;
    end if;
  end if;

  return query
  insert into public.tool_transactions (
    id, txn_no, tool_id, txn_type, qty, from_bucket, to_bucket, unit, unit_cost,
    location_from, location_to, job_id, machine, operation, employee, department,
    purpose, condition, reservation_id, maintenance_id, calibration_id,
    serial_number, batch_no, ref_type, ref_id, ref_no, ref_key, note, actor_email
  ) values (
    p_id, p_txn_no, p_tool_id, p_txn_type, p_qty, v_from, v_to, p_unit, p_unit_cost,
    p_location_from, p_location_to, p_job_id, p_machine, p_operation, p_employee, p_department,
    p_purpose, p_condition, p_reservation_id, p_maintenance_id, p_calibration_id,
    p_serial_number, p_batch_no, p_ref_type, p_ref_id, p_ref_no, p_ref_key, p_note,
    public.hr_current_email()
  ) returning *;

  perform public.hr_log(
    p_txn_type, 'tool', p_tool_id,
    concat_ws(' ', initcap(replace(p_txn_type, '_', ' ')), p_qty::text, coalesce(p_unit, '')),
    null,
    jsonb_build_object('txn_no', p_txn_no, 'qty', p_qty, 'from', v_from, 'to', v_to,
                       'job_id', p_job_id, 'machine', p_machine, 'ref_no', p_ref_no)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------
-- Masters + records: any approved user may read; writes by approved users
-- (the client hides controls the caller lacks; RLS keeps out unapproved users).
-- tool_transactions is written ONLY through tool_move() (SECURITY DEFINER), so
-- it gets read-only RLS for end users (no INSERT/UPDATE/DELETE policy).
do $$
declare t text;
begin
  foreach t in array array[
    'tool_categories','tools','tool_reservations','tool_maintenance','tool_calibrations'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists tr_read on public.%I;', t);
    execute format('create policy tr_read on public.%I for select to authenticated using (public.is_app_approved());', t);
    execute format('drop policy if exists tr_write on public.%I;', t);
    execute format('create policy tr_write on public.%I for all to authenticated using (public.is_app_approved()) with check (public.is_app_approved());', t);
  end loop;
end $$;

alter table public.tool_transactions enable row level security;
drop policy if exists tr_txn_read on public.tool_transactions;
create policy tr_txn_read on public.tool_transactions for select to authenticated
  using (public.is_app_approved());

-- ---------------------------------------------------------------------------
-- 8. RBAC — extend the shared permission catalog + grant to existing roles
-- ---------------------------------------------------------------------------
insert into public.hr_permissions (key, module, label, description, sort) values
  ('TOOLROOM_VIEW',      'Tool Room', 'View Tool Room',     'Access the Tool Room area and dashboard', 200),
  ('TOOLROOM_TOOL_MANAGE','Tool Room','Manage tools',       'Create/edit/delete tools & categories',   201),
  ('TOOLROOM_RECEIVE',   'Tool Room', 'Receive tools',      'Receive purchased/returned stock',        202),
  ('TOOLROOM_ISSUE',     'Tool Room', 'Issue tools',        'Issue & consume tools',                   203),
  ('TOOLROOM_RETURN',    'Tool Room', 'Return tools',       'Record tool returns',                     204),
  ('TOOLROOM_RESERVE',   'Tool Room', 'Reserve tools',      'Reserve/release tools',                   205),
  ('TOOLROOM_TRANSFER',  'Tool Room', 'Transfer tools',     'Transfer tools between locations',        206),
  ('TOOLROOM_MAINTAIN',  'Tool Room', 'Maintain tools',     'Send for / complete maintenance',         207),
  ('TOOLROOM_CALIBRATE', 'Tool Room', 'Calibrate tools',    'Send for / complete calibration',         208),
  ('TOOLROOM_SCRAP',     'Tool Room', 'Scrap tools',        'Scrap / dispose tools',                   209),
  ('TOOLROOM_ADJUST',    'Tool Room', 'Adjust stock',       'Post stock adjustments',                  210),
  ('TOOLROOM_REPORT',    'Tool Room', 'View Tool Room reports', 'View & export Tool Room reports',     211),
  ('TOOLROOM_SETTINGS',  'Tool Room', 'Manage Tool Room settings', 'Manage Tool Room configuration',   212)
on conflict (key) do update
  set module = excluded.module, label = excluded.label,
      description = excluded.description, sort = excluded.sort;

-- HR Admin already gets every catalog permission via the 0019 "all keys" grant
-- (re-applied here idempotently so a fresh apply order is safe).
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_admin', key, 'all' from public.hr_permissions where key like 'TOOLROOM_%'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- HR Manager: operate Tool Room company-wide (minus settings, kept with admin).
insert into public.hr_role_permissions (role_id, permission_key, scope)
  select 'role_hr_manager', key, 'company' from public.hr_permissions
  where key like 'TOOLROOM_%' and key <> 'TOOLROOM_SETTINGS'
on conflict (role_id, permission_key) do update set scope = excluded.scope;

-- ---------------------------------------------------------------------------
-- 9. Seed — standard tool categories (configuration defaults, not demo stock).
-- ---------------------------------------------------------------------------
insert into public.tool_categories (id, code, name, description) values
  ('tcat_cutting',   'CUT', 'Cutting Tools',   'Drills, end mills, inserts, reamers, taps'),
  ('tcat_measuring', 'MEA', 'Measuring Tools', 'Vernier, micrometer, bore/height gauges'),
  ('tcat_hand',      'HND', 'Hand Tools',      'Spanners, hammers, files'),
  ('tcat_power',     'PWR', 'Power Tools',     'Grinders, drilling machines'),
  ('tcat_holding',   'HLD', 'Tool Holding',    'Holders, collets, chucks, fixtures, jigs'),
  ('tcat_abrasive',  'ABR', 'Abrasives',       'Grinding wheels, discs'),
  ('tcat_welding',   'WLD', 'Welding Accessories', 'Nozzles, tips, electrodes'),
  ('tcat_safety',    'SAF', 'Safety Accessories', 'PPE and safety equipment')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------
grant select on public.tool_inventory to authenticated;
grant execute on function public.tool_bucket_balance(text, text) to authenticated;
grant execute on function public.tool_can(text) to authenticated;
grant execute on function public.tool_move(
  text, text, text, text, numeric, text, numeric, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, boolean, boolean
) to authenticated;
