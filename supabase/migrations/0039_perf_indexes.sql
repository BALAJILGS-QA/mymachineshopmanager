-- ============================================================================
-- Performance: missing FK / filter indexes on the money + stock ledgers
-- ============================================================================
-- PURELY ADDITIVE and NON-BREAKING. This migration only creates indexes and
-- drops one redundant index. It changes NO data, NO constraints, NO RLS, NO
-- RPC behaviour. It is safe to apply to production at any time and is fully
-- reversible (drop the indexes / recreate the dropped one).
--
-- Rationale (see docs/DATABASE_AUDIT_REPORT.md §9, finding H4/L3):
--   • Several foreign-key and common-filter columns on the highest-traffic
--     tables (invoices, payments, expenses, the three stock ledgers,
--     delivery_challans, invoice_lines, bank_transactions, subcontracting,
--     own_material_purchases) had no supporting index, forcing sequential
--     scans on customer-ledger / AR-aging / stock-balance / job-costing reads.
--   • idx_issues_reference (reference_type, reference_id) is a strict prefix of
--     the later unique index uq_issue_reference_material_source, so it is
--     redundant and can be dropped without losing any lookup path.
--
-- NOTE on CONCURRENTLY: Supabase CLI wraps each migration in a transaction, and
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction. Plain CREATE INDEX
-- takes a brief lock; at single-shop data volumes this is sub-second. If a table
-- has grown large before this is applied, create these indexes CONCURRENTLY by
-- hand in the SQL editor instead and skip the matching lines here.
-- Idempotent: create index if not exists / drop index if exists.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Sales: invoices, payments, invoice_lines, delivery_challans
-- ---------------------------------------------------------------------------
-- Invoice lists are filtered by customer, status and date (AR aging / dashboard).
create index if not exists idx_invoices_company      on public.invoices (company_id);
create index if not exists idx_invoices_status       on public.invoices (status);
create index if not exists idx_invoices_date         on public.invoices (date desc);
create index if not exists idx_invoices_company_date on public.invoices (company_id, date desc);

-- Customer ledger / receipts by customer & date (only invoice_id was indexed).
create index if not exists idx_payments_company      on public.payments (company_id);
create index if not exists idx_payments_date         on public.payments (date desc);
create index if not exists idx_payments_company_date on public.payments (company_id, date desc);

-- Job-costing and stock traceability off invoice lines.
create index if not exists idx_invoice_lines_job      on public.invoice_lines (job_id);
create index if not exists idx_invoice_lines_material on public.invoice_lines (material_id);

-- Challan → job / invoice links (cancel/free logic and job dispatch views).
create index if not exists idx_dc_job     on public.delivery_challans (job_id);
create index if not exists idx_dc_invoice on public.delivery_challans (invoice_id);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create index if not exists idx_expenses_company on public.expenses (company_id);
create index if not exists idx_expenses_job     on public.expenses (job_id);
create index if not exists idx_expenses_date    on public.expenses (date desc);

-- ---------------------------------------------------------------------------
-- Stock ledgers: material_id drives material_balance() / material_stock view /
-- receipt_available(); company_id scopes owner balances. None were indexed.
-- ---------------------------------------------------------------------------
create index if not exists idx_receipts_material on public.material_receipts (material_id);
create index if not exists idx_receipts_company  on public.material_receipts (company_id);
create index if not exists idx_receipts_job      on public.material_receipts (job_id);

create index if not exists idx_issues_material on public.material_issues (material_id);
create index if not exists idx_issues_company  on public.material_issues (company_id);
create index if not exists idx_issues_job      on public.material_issues (job_id);

create index if not exists idx_adjustments_material on public.stock_adjustments (material_id);
create index if not exists idx_adjustments_company  on public.stock_adjustments (company_id);

-- ---------------------------------------------------------------------------
-- Banking: reconciliation lookup by matched invoice.
-- ---------------------------------------------------------------------------
create index if not exists idx_btx_matched_invoice on public.bank_transactions (matched_invoice_id);

-- ---------------------------------------------------------------------------
-- Subcontracting + own-material purchase FK links.
-- ---------------------------------------------------------------------------
create index if not exists idx_sc_company on public.subcontract_orders (company_id);
create index if not exists idx_sc_job     on public.subcontract_orders (job_id);
create index if not exists idx_scdoc_expense on public.subcontract_docs (expense_id);

create index if not exists idx_own_purchase_receipt on public.own_material_purchases (receipt_id);
create index if not exists idx_own_purchase_expense on public.own_material_purchases (expense_id);

-- ---------------------------------------------------------------------------
-- Remove redundant index (prefix of uq_issue_reference_material_source).
-- ---------------------------------------------------------------------------
drop index if exists public.idx_issues_reference;
