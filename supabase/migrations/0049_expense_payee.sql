-- ============================================================================
-- Purchase Management: add a Payee (receiver name) to expenses.
-- ============================================================================
-- The payee is *who received the money* (e.g. the person for a self cash
-- withdrawal), which is distinct from the supplier/vendor a purchase was made
-- from. Nullable text — existing rows stay unaffected; tenant_id is untouched.
-- Idempotent: add column only if it does not already exist.
-- ============================================================================

alter table public.expenses add column if not exists payee text;

comment on column public.expenses.payee is
  'Receiver name — who the money was paid to (e.g. self for a cash withdrawal). Distinct from vendor/supplier.';
