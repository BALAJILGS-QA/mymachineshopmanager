-- ============================================================================
-- Materials: optional per-company scope
-- ============================================================================
-- A material may belong to a specific customer (company_id set) or be shared/own
-- (company_id null). Customer-material flows show that company's materials plus
-- shared ones; own-material flows show shared/own materials.
-- Additive, nullable, reversible. No data change.
-- ============================================================================

alter table public.materials
  add column if not exists company_id text references public.companies(id);

create index if not exists idx_materials_company on public.materials (company_id);
