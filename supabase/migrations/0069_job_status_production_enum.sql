-- 0069_job_status_production_enum.sql
--
-- Production Module (vertical slice) — extend the job_status lifecycle.
--
-- ISOLATED on purpose: Postgres forbids USING a newly added enum value in the
-- SAME transaction/migration that adds it ("unsafe use of new value"). So the
-- enum additions live ALONE here; the RPCs that transition jobs into these
-- states ship in 0072, after this has committed. (Same pattern as 0055.)
--
-- We REUSE the existing values rather than duplicating them:
--   'In Progress' = production is running   (no new IN_PRODUCTION value)
--   'Completed'   = production completed     (no new PRODUCTION_COMPLETED value)
-- and ADD the five new downstream states. Existing values and the existing
-- 'Completed' -> 'Delivered' path are untouched, so historical jobs keep working.
--
-- New lifecycle (new jobs):
--   Draft -> Pending -> In Progress -> Completed -> Quality Control
--     -> QC Approved -> Ready for Dispatch -> Delivered
--   with Quality Control -> Rework -> In Progress (loop) and
--        Quality Control -> QC Rejected (terminal).
--
-- ADD VALUE IF NOT EXISTS is idempotent and safe to re-run.

alter type public.job_status add value if not exists 'Quality Control'    after 'Completed';
alter type public.job_status add value if not exists 'QC Approved'        after 'Quality Control';
alter type public.job_status add value if not exists 'Rework'             after 'QC Approved';
alter type public.job_status add value if not exists 'QC Rejected'        after 'Rework';
alter type public.job_status add value if not exists 'Ready for Dispatch' before 'Delivered';
