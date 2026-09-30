-- ============================================================================
-- Invoice Payment & Settlement — part 1: enum extensions (ISOLATED).
-- ============================================================================
-- Postgres forbids USING a new enum value in the SAME transaction that adds it
-- ("unsafe use of new value ..."). So enum additions live in their OWN migration
-- file — committed here — before 0056+ (tables, view, RPCs) reference them.
--
-- Additive only. No DROP. Existing rows/values untouched. Idempotent via
-- IF NOT EXISTS (PostgreSQL 12+; Supabase runs 15+).
--
--   invoice_status  += 'Settled'   — invoice closed via payment + valid/known
--                                    deductions (+ an explicit unknown diff) even
--                                    though cash received < gross. Distinct from
--                                    'Paid' (fully collected in money).
--   payment_method  += 'NEFT','RTGS','IMPS' — real bank-transfer rails alongside
--                                    the existing generic 'Bank Transfer'.
-- See docs/DATABASE_AUDIT_REPORT.md and the Payment & Settlement plan.
-- ============================================================================

alter type invoice_status add value if not exists 'Settled';

alter type payment_method add value if not exists 'NEFT';
alter type payment_method add value if not exists 'RTGS';
alter type payment_method add value if not exists 'IMPS';
