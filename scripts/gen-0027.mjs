// Generate migration 0027: align the HRM module's authorization with the app
// baseline (is_app_approved), exactly like finance (0026). Relaxes HRM table RLS
// to a single approved_all policy and re-emits the HRM RPCs with is_app_approved
// guards. notifications keeps its recipient-scoped policies; hr_audit_log stays
// read-only (writes go through hr_log). RBAC stays available for future use.
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
  'hr_next_employee_code',
  'hr_apply_leave',
  'hr_decide_leave',
  'hr_run_payroll',
  'hr_finalize_payroll',
  'hr_assign_role',
  'hr_revoke_role',
]
const REPLACES = [
  [
    "public.hr_has_permission('EMPLOYEE_CREATE') or public.is_hr_admin()",
    'public.is_app_approved()',
  ],
  [
    "public.hr_has_permission('PAYROLL_PROCESS') or public.is_hr_admin()",
    'public.is_app_approved()',
  ],
  [
    "public.hr_has_permission('PAYROLL_FINALIZE') or public.is_hr_admin()",
    'public.is_app_approved()',
  ],
  ["public.hr_has_permission('LEAVE_APPROVE') or public.is_hr_admin()", 'public.is_app_approved()'],
  ['if not public.is_hr_admin() then', 'if not public.is_app_approved() then'],
]

const defs = []
for (const fn of FUNCS) {
  const rows = await q(
    `select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${fn}'`,
  )
  for (const r of rows) {
    let def = r.def
    for (const [a, b] of REPLACES) def = def.split(a).join(b)
    if (
      /hr_has_permission\('(EMPLOYEE_CREATE|PAYROLL_PROCESS|PAYROLL_FINALIZE|LEAVE_APPROVE)'\)/.test(
        def,
      )
    ) {
      throw new Error(`Guard not replaced in ${fn}`)
    }
    defs.push(`-- ${fn}\n${def};`)
  }
}

// Operational + RBAC + settings tables → approved_all (read+write).
const APPROVED_ALL = [
  'departments',
  'designations',
  'employees',
  'employee_status_history',
  'shifts',
  'shift_assignments',
  'holidays',
  'leave_types',
  'leave_balances',
  'leave_applications',
  'attendance',
  'salary_components',
  'salary_structures',
  'salary_structure_lines',
  'employee_salary',
  'payroll_periods',
  'payroll_runs',
  'payroll_records',
  'document_types',
  'employee_documents',
  'employee_assets',
  'asset_assignments',
  'employee_advances',
  'advance_repayments',
  'expense_categories',
  'expense_claims',
  'job_openings',
  'candidates',
  'interview_rounds',
  'job_offers',
  'performance_cycles',
  'performance_reviews',
  'performance_goals',
  'training_programs',
  'training_sessions',
  'employee_training',
  'hr_permissions',
  'hr_roles',
  'hr_role_permissions',
  'hr_user_roles',
  'hr_settings',
]

const sql = `-- ============================================================================
-- 0027: Align HRM authorization with the app baseline (is_app_approved), the
-- same fix as finance (0026). The HR RBAC (0019-0021) gated everything on HR
-- permissions that no one has been assigned, locking approved users out of the
-- whole HRM module. This restores parity with the rest of the ERP. RBAC stays
-- available for future fine-grained control. Additive + idempotent.
-- notifications keeps its recipient-scoped policies; hr_audit_log stays
-- read-only for approved users (writes go through hr_log()).
-- ============================================================================

-- 1. Tables → single approved_all policy (drop every existing policy first, so
--    this is name-agnostic and repeatable).
do $$
declare t text; p record;
begin
  foreach t in array array[${APPROVED_ALL.map((t) => `'${t}'`).join(',')}]
  loop
    execute format('alter table public.%I enable row level security;', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I;', p.policyname, t);
    end loop;
    execute format($f$create policy approved_all on public.%I for all to authenticated
      using (public.is_app_approved()) with check (public.is_app_approved());$f$, t);
  end loop;
end $$;

-- 2. hr_audit_log: readable by any approved user (still written only via hr_log).
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='hr_audit_log' loop
    execute format('drop policy if exists %I on public.hr_audit_log;', p.policyname);
  end loop;
  execute 'create policy hr_audit_read on public.hr_audit_log for select to authenticated using (public.is_app_approved())';
end $$;

-- 3. RPC guards → is_app_approved() (re-emitted verbatim with guard relaxed).
${defs.join('\n\n')}
`

writeFileSync(new URL('../supabase/migrations/0027_hrm_rls_align.sql', import.meta.url), sql)
console.log(`Wrote 0027 (${sql.length} bytes, ${defs.length} functions re-emitted)`)
