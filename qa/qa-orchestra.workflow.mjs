export const meta = {
  name: 'qa-orchestra',
  description:
    'QA-Orchestra: understand → manual cases (Zephyr) → review → Playwright specs → reuse-review, per module',
  phases: [{ title: 'Understand+Author' }, { title: 'Review' }, { title: 'Automate' }],
}

// Full module registry (mirrors e2e/support/modules.ts). Edit SELECT to choose
// which modules this run processes; SELECT = [] means ALL.
const ALL_MODULES = [
  {
    id: 'dashboard',
    route: '/app',
    label: 'Dashboard',
    group: 'Dashboard',
    feature: 'src/features/dashboard',
  },
  {
    id: 'jobs',
    route: '/app/jobs',
    label: 'Job Orders',
    group: 'Production Planning',
    feature: 'src/features/jobs',
  },
  {
    id: 'production',
    route: '/app/production',
    label: 'Production',
    group: 'Production Planning',
    feature: 'src/features/production',
  },
  {
    id: 'tool-room',
    route: '/app/tool-room',
    label: 'Tool Room',
    group: 'Production Planning',
    feature: 'src/features/toolroom',
  },
  {
    id: 'inventory-dashboard',
    route: '/app/inventory/dashboard',
    label: 'Inventory Dashboard',
    group: 'Inventory',
    feature: 'src/features/inventory',
  },
  {
    id: 'materials',
    route: '/app/inventory/materials',
    label: 'Materials & Stock',
    group: 'Inventory',
    feature: 'src/features/materials',
  },
  {
    id: 'stock-movements',
    route: '/app/inventory/movements',
    label: 'Stock Movements',
    group: 'Inventory',
    feature: 'src/features/inventory',
  },
  {
    id: 'stock-adjustments',
    route: '/app/inventory/adjustments',
    label: 'Stock Adjustments',
    group: 'Inventory',
    feature: 'src/features/inventory',
  },
  {
    id: 'stock-transfers',
    route: '/app/inventory/transfers',
    label: 'Stock Transfers',
    group: 'Inventory',
    feature: 'src/features/inventory',
  },
  {
    id: 'stock-history',
    route: '/app/inventory/history',
    label: 'Stock History',
    group: 'Inventory',
    feature: 'src/features/inventory',
  },
  {
    id: 'inventory-reports',
    route: '/app/inventory/reports',
    label: 'Inventory Reports',
    group: 'Inventory',
    feature: 'src/features/inventory',
  },
  {
    id: 'sales',
    route: '/app/sales',
    label: 'Sales',
    group: 'Sales',
    feature: 'src/features/sales',
  },
  { id: 'crm', route: '/app/crm', label: 'CRM', group: 'CRM', feature: 'src/features/crm' },
  {
    id: 'hrm-employees',
    route: '/app/hrm/employees',
    label: 'Employees',
    group: 'Human Resources',
    feature: 'src/features/hrm',
  },
  {
    id: 'hrm-attendance',
    route: '/app/hrm/attendance',
    label: 'Attendance',
    group: 'Human Resources',
    feature: 'src/features/hrm',
  },
  {
    id: 'hrm-leave',
    route: '/app/hrm/leave',
    label: 'Leave Management',
    group: 'Human Resources',
    feature: 'src/features/hrm',
  },
  {
    id: 'hrm-payroll',
    route: '/app/hrm/payroll',
    label: 'Payroll',
    group: 'Human Resources',
    feature: 'src/features/hrm',
  },
  {
    id: 'hrm-recruitment',
    route: '/app/hrm/recruitment',
    label: 'Recruitment',
    group: 'Human Resources',
    feature: 'src/features/hrm',
  },
  {
    id: 'hrm-performance',
    route: '/app/hrm/performance',
    label: 'Performance',
    group: 'Human Resources',
    feature: 'src/features/hrm',
  },
  {
    id: 'hrm-training',
    route: '/app/hrm/training',
    label: 'Training',
    group: 'Human Resources',
    feature: 'src/features/hrm',
  },
  {
    id: 'hrm-reports',
    route: '/app/hrm/reports',
    label: 'HR Reports',
    group: 'Human Resources',
    feature: 'src/features/hrm',
  },
  {
    id: 'hrm-settings',
    route: '/app/hrm/settings',
    label: 'HR Settings',
    group: 'Human Resources',
    feature: 'src/features/hrm',
  },
  {
    id: 'expenses',
    route: '/app/expenses',
    label: 'Purchase Management',
    group: 'Accounts & Finance',
    feature: 'src/features/expenses',
  },
  {
    id: 'deliveries',
    route: '/app/deliveries',
    label: 'Delivery Challan',
    group: 'Accounts & Finance',
    feature: 'src/features/deliveries',
  },
  {
    id: 'invoices',
    route: '/app/invoices',
    label: 'Invoices',
    group: 'Accounts & Finance',
    feature: 'src/features/invoices',
  },
  {
    id: 'payments',
    route: '/app/payments',
    label: 'Payments',
    group: 'Accounts & Finance',
    feature: 'src/features/payments',
  },
  {
    id: 'chart-of-accounts',
    route: '/app/accounts/chart-of-accounts',
    label: 'Chart of Accounts',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'journals',
    route: '/app/accounts/journals',
    label: 'Journal Entries',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'ledger',
    route: '/app/accounts/ledger',
    label: 'General Ledger',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'bank-accounts',
    route: '/app/accounts/bank-accounts',
    label: 'Bank Accounts',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'bank-import',
    route: '/app/accounts/bank-import',
    label: 'Bank Import',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'reconciliation',
    route: '/app/accounts/reconciliation',
    label: 'Bank Reconciliation',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'gst',
    route: '/app/accounts/gst',
    label: 'GST',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'gst-returns',
    route: '/app/accounts/gst-returns',
    label: 'GST Returns',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'einvoice',
    route: '/app/accounts/einvoice',
    label: 'E-Invoice',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'eway',
    route: '/app/accounts/eway',
    label: 'E-Way Bill',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'tax-config',
    route: '/app/accounts/tax-config',
    label: 'Tax Configuration',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'financials',
    route: '/app/accounts/financials',
    label: 'Financial Statements',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'periods',
    route: '/app/accounts/periods',
    label: 'Accounting Periods',
    group: 'Accounts & Finance',
    feature: 'src/features/finance',
  },
  {
    id: 'vendors',
    route: '/app/vendors',
    label: 'Vendors',
    group: 'Supply Chain',
    feature: 'src/features/vendors',
  },
  {
    id: 'subcontracting',
    route: '/app/subcontracting',
    label: 'Subcontracting',
    group: 'Supply Chain',
    feature: 'src/features/subcontracting',
  },
  {
    id: 'companies',
    route: '/app/companies',
    label: 'Companies',
    group: 'Configuration & Settings',
    feature: 'src/features/companies',
  },
  {
    id: 'approvals',
    route: '/app/approvals',
    label: 'User Approvals',
    group: 'Configuration & Settings',
    feature: 'src/features/approvals',
    superAdmin: true,
  },
  {
    id: 'roles',
    route: '/app/roles',
    label: 'Roles & Permissions',
    group: 'Configuration & Settings',
    feature: 'src/features/access',
    superAdmin: true,
  },
  {
    id: 'reports',
    route: '/app/reports',
    label: 'Reports',
    group: 'Configuration & Settings',
    feature: 'src/features/reports',
  },
  {
    id: 'settings',
    route: '/app/settings',
    label: 'Settings',
    group: 'Configuration & Settings',
    feature: 'src/features/settings',
  },
]

// EDIT THIS between runs. [] = all modules; otherwise the listed ids only.
// Inventory batch first (per request), then remaining groups.
const SELECT = [
  'inventory-dashboard',
  'materials',
  'stock-movements',
  'stock-adjustments',
  'stock-transfers',
  'stock-history',
  'inventory-reports',
]
const modules = SELECT.length ? ALL_MODULES.filter((m) => SELECT.includes(m.id)) : ALL_MODULES
if (!modules.length) throw new Error('qa-orchestra: SELECT matched no modules')

// ── Shared context handed to every agent ─────────────────────────────────────
const SUPPORT_API = `
Reusable Playwright support library — generated specs MUST import ONLY from '../support'
(the specs live in e2e/generated/, so the relative path is '../support'). Reuse these;
do NOT re-implement login, navigation, table reads, form fills, or assertions.

  import { test, expect, gotoModule, navByLabel, expectHeading, hasClientCrash,
           dt, forms, expectToast, expectHealthy, expectNoFailedRequests,
           MODULES, moduleById } from '../support'

Auth: every spec already runs authenticated as the QA super-admin (Playwright
storageState). Do NOT call loginAsQA inside specs — just gotoModule().

Navigation:  gotoModule(page, route)  navByLabel(page, label)  expectHeading(page, name|RegExp)  hasClientCrash(page):Promise<boolean>
Tables (dt): dt.table(page) dt.rows(page) dt.rowCount(page):Promise<number> dt.rowByText(page,text)
             dt.isEmptyState(page):Promise<boolean> dt.search(page,term) dt.expectRow(page,text)
Forms:       forms.dialog(page) forms.openForm(page,trigger) forms.fill(page,label,value)
             forms.select(page,label,option) forms.submit(page,name?) forms.expectValidationError(page,msg)
Assertions:  expectToast(page,text) expectHealthy(page) expectNoFailedRequests(page, async()=>{...})

HARD-WON RULES (follow exactly — these caused pilot failures):
- The QA tenant is ISOLATED and EMPTY. Lists usually have ZERO rows. Write data-tolerant
  assertions (dt.rowCount(page) >= 0; assert "table OR empty state"). NEVER assume seed data.
- For form controls use forms.control(page, label) / forms.fill / forms.select — NOT raw
  page.getByLabel(...): many legacy pages have <label> NOT associated with their input, so
  getByLabel hangs (45s timeout). forms.control tolerates that.
- For a dialog/modal title use dlg.getByRole('heading', { name }) — NOT dlg.getByText(name)
  (getByText also matches a same-named submit button → strict-mode violation).
- Unauthenticated-gate (Security) tests: a fresh no-storageState context navigating to /app/**
  is REDIRECTED to '/' (not '/login'). Assert: await anon.waitForURL(u => !u.pathname.startsWith(route))
  then no 'table tbody tr' rows. Do NOT assert on a page heading (collides with marketing copy).
- Auth is injected via storageState; NEVER log in inside a spec. Just gotoModule(page, route).
`.trim()

const CATEGORIES = `UI, Validation, Functionality, API, Security, Database`
const CASE_JSON = `
Each test case object:
{ "key": "MSM-<MODULE_UPPER>-<CAT>-<NNN>",  // CAT ∈ UI|VAL|FUNC|API|SEC|DB
  "name": "concise action-oriented title",
  "category": "UI|Validation|Functionality|API|Security|Database",
  "priority": "Highest|High|Normal|Low",
  "status": "Approved",
  "objective": "what it verifies",
  "precondition": "Logged in as QA super-admin; ...",
  "testData": "inputs / fixtures (or empty)",
  "steps": ["step 1", "step 2", ...],
  "expectedResult": "overall expected outcome",
  "labels": ["regression","smoke", ...],
  "destructive": true|false }  // true if it creates/updates/deletes real data
`.trim()

const MODULE_SCHEMA = {
  type: 'object',
  required: ['module', 'component', 'understanding', 'cases'],
  properties: {
    module: { type: 'string' },
    component: { type: 'string' },
    understanding: { type: 'string', description: 'Phase-1 functionality summary' },
    cases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'name', 'category', 'steps', 'expectedResult', 'destructive'],
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          category: {
            type: 'string',
            enum: ['UI', 'Validation', 'Functionality', 'API', 'Security', 'Database'],
          },
          priority: { type: 'string' },
          status: { type: 'string' },
          objective: { type: 'string' },
          precondition: { type: 'string' },
          testData: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' } },
          expectedResult: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
          destructive: { type: 'boolean' },
        },
      },
    },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['module', 'component', 'cases', 'reviewNotes'],
  properties: {
    module: { type: 'string' },
    component: { type: 'string' },
    understanding: { type: 'string' },
    reviewNotes: { type: 'string' },
    cases: MODULE_SCHEMA.properties.cases,
  },
}

const SPEC_SCHEMA = {
  type: 'object',
  required: ['spec', 'automatedKeys', 'reuseNotes'],
  properties: {
    spec: { type: 'string', description: 'full TypeScript content of the .spec.ts file' },
    automatedKeys: {
      type: 'array',
      items: { type: 'string' },
      description: 'manual case keys covered by non-destructive tests',
    },
    reuseNotes: { type: 'string' },
  },
}

// ── Pipeline: each module flows through all 3 stages independently ────────────
const results = await pipeline(
  modules,

  // Phase 1 + 2 — Understand functionality, author manual cases (Zephyr format).
  (m) =>
    agent(
      `You are a senior QA engineer. Module "${m.label}" (id "${m.id}", route ${m.route}) of the MSM
Next.js machine-shop app. Source lives under ${m.feature} (feature-first: api/, hooks/, *Page.tsx, forms).

PHASE 1 — UNDERSTAND: Read the feature source (use Read/Grep on ${m.feature} and the route file
under app${m.route.replace('/app', '/app/app')}). Summarize the real functionality: entities, list/detail
screens, forms & fields, validations (Zod), workflows/state transitions, Supabase API/RPC calls, and any
computations. Base everything on the ACTUAL code, not assumptions.

PHASE 2 — AUTHOR manual test cases in Zephyr Scale format, categorized across: ${CATEGORIES}.
Provide meaningful coverage in EVERY applicable category (a read-only screen may have few Validation cases —
that's fine, note why). Aim ~10-16 cases total. Mark destructive:true for any case that creates/updates/
deletes data. Keys like MSM-${m.id.toUpperCase().replace(/[^A-Z0-9]/g, '')}-UI-001.

${CASE_JSON}

Return the structured object (module="${m.id}", component="${m.label}").`,
      { label: `understand:${m.id}`, phase: 'Understand+Author', schema: MODULE_SCHEMA },
    ),

  // Phase 3 — Review the manual test cases.
  (authored, m) => {
    if (!authored) return null
    return agent(
      `You are a QA lead reviewing manual test cases for module "${m.label}" (${m.route}).
Draft cases (JSON):
${JSON.stringify(authored, null, 2)}

Review for: correctness vs the app's real behavior, category balance across ${CATEGORIES}, clear
preconditions/steps/expected results, unique stable keys, right destructive flags, and no duplicates or gaps.
Fix issues directly. Return the REFINED full case set (same schema) plus concise reviewNotes describing changes
and any residual coverage gaps.`,
      { label: `review:${m.id}`, phase: 'Review', schema: REVIEW_SCHEMA },
    )
  },

  // Phase 4 + 5 — Generate the Playwright spec reusing the shared library; self-review for reuse.
  async (reviewed, m) => {
    if (!reviewed) return null
    const cases = reviewed.cases || []
    const spec = await agent(
      `You are a Playwright automation engineer. Generate ONE TypeScript spec file for module
"${m.label}" (route ${m.route}) that automates the NON-DESTRUCTIVE cases below, reusing the shared
support library. Destructive cases (create/update/delete) must ALSO be generated but each such test title
MUST contain the "@destructive" tag so the config can exclude them by default.

${SUPPORT_API}

PHASE 4 — Write robust, deterministic tests: use gotoModule for navigation, dt.* for tables/empty states,
forms.* for forms, and expectHealthy/expectToast/expect for verification. Prefer role/label/text locators.
No hard-coded sleeps beyond the helpers. Tests run against LIVE PRODUCTION data, so assertions must be
data-tolerant (e.g. rowCount >= 0, "table or empty state"). Group with test.describe('${m.label} @${m.id}').

PHASE 5 — REVIEW your own spec: ensure it imports ONLY from '../support', reuses existing helpers instead of
re-implementing locators/actions/verifications, and every non-destructive case maps to a test. List the manual
case keys you automated in automatedKeys.

Manual cases (JSON):
${JSON.stringify(cases, null, 2)}

Return: spec (full file content, ready to write to e2e/generated/${m.id}.spec.ts), automatedKeys, reuseNotes.`,
      { label: `automate:${m.id}`, phase: 'Automate', schema: SPEC_SCHEMA },
    )
    // Bundle Phase-3 cases + Phase-4/5 spec so the main loop can write both.
    return {
      module: m.id,
      component: m.label,
      route: m.route,
      understanding: reviewed.understanding || '',
      reviewNotes: reviewed.reviewNotes || '',
      cases: cases,
      spec: spec?.spec || '',
      automatedKeys: spec?.automatedKeys || [],
      reuseNotes: spec?.reuseNotes || '',
    }
  },
)

return { modules: modules.map((m) => m.id), results: results.filter(Boolean) }
