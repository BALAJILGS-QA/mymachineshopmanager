-- ============================================================================
-- Inventory redesign - Phase 1a: generalize the stock-out ledger + unified view
-- ============================================================================
-- Reuses the existing receipts/issues/adjustments ledger (no duplicate ledger).
-- material_issues gains reference_type/reference_id so a stock-out can be linked
-- to a delivery challan (or job/production), and job_id becomes nullable because
-- a dispatch is not always tied to a job. A read-only inventory_ledger view
-- streams all three tables as one transaction history for the UI + reports.
--
-- Idempotent + additive. No DROP of data. No TRUNCATE.
-- ============================================================================

alter table public.material_issues
  add column if not exists reference_type text,
  add column if not exists reference_id   text;

-- Dispatch-linked issues have no job; relax the NOT NULL (existing rows keep theirs).
alter table public.material_issues alter column job_id drop not null;

create index if not exists idx_issues_reference
  on public.material_issues (reference_type, reference_id);

-- Prevent the same reference from deducting the same material twice (idempotency
-- for challan dispatch). Partial unique: only applies when a reference is set.
create unique index if not exists uq_issue_reference_material
  on public.material_issues (reference_type, reference_id, material_id)
  where reference_type is not null;

-- Unified inventory ledger (read-only). company_id null = own/shop stock.
create or replace view public.inventory_ledger as
  select
    r.id, r.material_id, r.company_id,
    case when r.company_id is null then 'Shop' else 'Company' end as ownership,
    'Receipt'::text as txn_type,
    r.quantity as qty_in, 0::numeric as qty_out,
    r.unit, r.date, r.receipt_no as doc_no,
    'MATERIAL_RECEIPT'::text as reference_type, r.id as reference_id,
    r.notes as note, r.created_at
  from public.material_receipts r
  union all
  select
    i.id, i.material_id, i.company_id,
    case when i.company_id is null then 'Shop' else 'Company' end,
    'Issue',
    0::numeric, i.quantity,
    i.unit, i.date, i.issue_no,
    coalesce(i.reference_type, case when i.job_id is not null then 'JOB_ORDER' end),
    coalesce(i.reference_id, i.job_id),
    i.note, i.created_at
  from public.material_issues i
  union all
  select
    a.id, a.material_id, a.company_id,
    case when a.company_id is null then 'Shop' else 'Company' end,
    'Adjustment',
    case when a.quantity > 0 then a.quantity else 0 end,
    case when a.quantity < 0 then -a.quantity else 0 end,
    a.unit, a.date, a.adj_no,
    'ADJUSTMENT', a.id,
    a.reason, a.created_at
  from public.stock_adjustments a;

grant select on public.inventory_ledger to authenticated;
