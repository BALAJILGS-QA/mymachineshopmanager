// Generate migration 0026: align the finance module's RLS + RPC guards to the
// app's baseline (is_app_approved), matching how companies/payments/invoices are
// protected. Fetches each finance RPC's current definition verbatim, rewrites
// only its authorization guard, and emits a single idempotent migration file.
import { writeFileSync } from 'node:fs'

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_PROJECT_REF
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'msm-migrate/1.0',
    },
    body: JSON.stringify({ query: sql }),
  })
  const t = await res.text()
  if (!res.ok) throw new Error(t)
  return JSON.parse(t)
}

const FUNCS = [
  'post_journal',
  'void_journal',
  'post_bank_txn',
  'post_bank_txn_split',
  'detect_bank_duplicates',
]

const defs = []
for (const fn of FUNCS) {
  const rows = await q(
    `select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${fn}'`,
  )
  for (const r of rows) {
    let def = r.def
    def = def
      .replaceAll(
        "public.hr_has_permission('JOURNAL_POST') or public.is_hr_admin()",
        'public.is_app_approved()',
      )
      .replaceAll(
        "public.hr_has_permission('BANK_IMPORT') or public.is_hr_admin()",
        'public.is_app_approved()',
      )
    if (/hr_has_permission\('(JOURNAL_POST|BANK_IMPORT)'\)/.test(def)) {
      throw new Error(`Guard not replaced in ${fn} — check formatting`)
    }
    defs.push(`-- ${fn}\n${def};`)
  }
}

const TABLES = [
  'chart_of_accounts',
  'fiscal_years',
  'accounting_periods',
  'journals',
  'journal_lines',
  'bank_accounts',
  'bank_statement_files',
  'bank_transactions',
  'bank_txn_rules',
  'party_aliases',
  'gst_registrations',
  'gst_tax_rates',
  'hsn_codes',
  'gst_return_periods',
  'einvoice_records',
  'eway_bills',
]

const sql = `-- ============================================================================
-- 0026: Align Accounts & Finance authorization with the app's baseline.
-- ============================================================================
-- Why: the existing ERP protects every table with a single policy — any
-- is_app_approved() user reads+writes (companies/payments/invoices all do this).
-- Migrations 0022-0025 gated finance on HR permissions that no one has been
-- assigned (hr_user_roles is empty), which locked approved users out of the
-- whole module (e.g. "unable to add a bank account"). This restores parity:
-- finance behaves like the rest of the ERP. The RBAC layer stays available —
-- once real roles are assigned an org can tighten these back — but the default
-- is usable. Additive + idempotent.
-- ============================================================================

-- 1. Table RLS → is_app_approved() (read + write), like companies.
do $$
declare t text;
begin
  foreach t in array array[${TABLES.map((t) => `'${t}'`).join(',')}]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists p_read on public.%I;', t);
    execute format('drop policy if exists p_write on public.%I;', t);
    execute format('drop policy if exists approved_all on public.%I;', t);
    execute format($f$create policy approved_all on public.%I for all to authenticated
      using (public.is_app_approved()) with check (public.is_app_approved());$f$, t);
  end loop;
end $$;

-- 2. RPC guards → is_app_approved() (re-emitted verbatim with the guard relaxed).
${defs.join('\n\n')}
`

writeFileSync(new URL('../supabase/migrations/0026_finance_rls_align.sql', import.meta.url), sql)
console.log(`Wrote 0026 (${sql.length} bytes, ${defs.length} functions re-emitted)`)
