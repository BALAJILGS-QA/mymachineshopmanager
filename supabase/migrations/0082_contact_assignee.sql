-- ============================================================================
-- CRM — assign a contact message to an employee owner (HRM-B)
-- ============================================================================
-- Part of making the HRM employee master the single person registry: a CRM
-- contact message can be assigned to the employee who owns the follow-up.
-- Nullable FK so the anonymous public-form insert is unaffected. Simple column
-- on an existing tenant-RLS table — no RPC/policy change.
--
-- Additive + idempotent. Reversible (drop column). Next free number after 0081.
-- ============================================================================

alter table public.contact_messages
  add column if not exists assigned_to_employee_id text references public.employees(id) on delete set null;
create index if not exists idx_contact_messages_assignee
  on public.contact_messages (assigned_to_employee_id);

-- ROLLBACK: alter table public.contact_messages drop column if exists assigned_to_employee_id;
