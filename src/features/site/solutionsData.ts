// Content for the public Feature (module) and Industry landing pages. Kept as
// structured data so every page renders consistently and feeds its own metadata,
// breadcrumbs, FAQ and JSON-LD. All copy describes capabilities that actually
// exist in the product (job orders, inventory, purchases, invoicing, accounting/
// GST, job work, tool room, HRM, reports) — nothing is fabricated.

export interface SolutionFaq {
  q: string
  a: string
}
export interface SolutionSection {
  h2: string
  body: string
  bullets?: string[]
}
export interface Solution {
  slug: string
  kind: 'feature' | 'industry'
  /** Short label for nav / breadcrumbs / cards. */
  name: string
  /** SEO <title> (includes the brand). */
  title: string
  /** Page H1. */
  h1: string
  /** Meta description (~150 chars). */
  metaDescription: string
  keywords: string[]
  /** One-paragraph lede under the H1. */
  intro: string
  sections: SolutionSection[]
  benefits: string[]
  faqs: SolutionFaq[]
  /** Slugs of related solutions to cross-link (contextual internal linking). */
  related: string[]
}

const BRAND = 'Machine Shop Management'

export const FEATURES: Solution[] = [
  {
    slug: 'production-management',
    kind: 'feature',
    name: 'Production Management',
    title: `Production Management Software | ${BRAND}`,
    h1: 'Production management software for machine shops',
    metaDescription:
      'Plan and track production from job order to dispatch. Raise job orders, monitor shop-floor progress and keep every machine balanced with MSM.',
    keywords: [
      'production management software',
      'shop floor tracking',
      'job order management',
      'manufacturing production planning',
    ],
    intro:
      'Turn customer orders into scheduled job orders and follow every part from first-off to final dispatch. Production management in MSM mirrors how a real machine shop runs, so your team plans on the software instead of on paper.',
    sections: [
      {
        h2: 'From job order to dispatch, in one flow',
        body: 'Raise a job order against a company, attach the part and quantity, and track its status as it moves through the shop. Production events record what happened and when, so the current state of every job is always visible.',
        bullets: [
          'Job orders with company, part, quantity and priority',
          'Live status from pending through in-progress to completed and delivered',
          'Production events that build an auditable history per job',
        ],
      },
      {
        h2: 'Keep the shop floor balanced',
        body: 'See what is in progress across the floor so work centres stay productive and nothing stalls. Because job orders, materials and dispatch live in the same system, planning reflects real stock and real capacity.',
      },
      {
        h2: 'Full traceability by default',
        body: 'Every job links back to the material it consumed and forward to the delivery challan and invoice it produced — audit-ready whenever a customer or auditor asks.',
      },
    ],
    benefits: [
      'One source of truth for job status across the shop',
      'No re-keying between planning, stores and dispatch',
      'Complete order-to-dispatch history for every job',
    ],
    faqs: [
      {
        q: 'Can I track a job from order to dispatch?',
        a: 'Yes. Each job order carries its status through the full lifecycle, and links to the delivery challans and invoices it generated, so you always know where a job stands.',
      },
      {
        q: 'Does production planning use live stock?',
        a: 'Yes. Materials, job orders and dispatch share one database, so planning reflects the material you actually have on hand.',
      },
    ],
    related: [
      'inventory-management',
      'job-work-management',
      'sales-invoicing',
      'reports-analytics',
    ],
  },
  {
    slug: 'inventory-management',
    kind: 'feature',
    name: 'Inventory Management',
    title: `Inventory & Stock Management Software | ${BRAND}`,
    h1: 'Inventory and stock management software',
    metaDescription:
      'Track raw material and stock with per-source traceability. Manage own stock and customer-supplied material, receipts, issues, transfers and reorder levels.',
    keywords: [
      'inventory management software',
      'stock management software',
      'material traceability',
      'raw material tracking',
    ],
    intro:
      'Know exactly what stock you hold, where it came from and where it went. MSM tracks both your own material and customer-supplied stock at the level of each individual receipt, so balances never drift from reality.',
    sections: [
      {
        h2: 'Own stock and customer material, tracked separately',
        body: 'Materials & Stock keeps shop-owned inventory and customer-supplied material in clearly separated views, each with its own receipts, issues and live balances.',
        bullets: [
          'Per-source stock: every receipt tracked and reduced independently',
          'Receipts, issues and stock adjustments with a full ledger',
          'Stock transfers and reorder-level alerts',
        ],
      },
      {
        h2: 'Traceability down to the receipt',
        body: 'Each dispatch records which specific receipt it drew from, so you can trace any delivered part back to its intake — essential for heat- and lot-level accountability.',
      },
      {
        h2: 'Purchases that feed stock automatically',
        body: 'Recording a material purchase adds it straight to own stock and logs the expense in one step, so stores and accounts stay in sync without double entry.',
      },
    ],
    benefits: [
      'Accurate on-hand balances you can trust',
      'Trace any part back to its source receipt',
      'Reorder visibility so you never run dry mid-job',
    ],
    faqs: [
      {
        q: 'Can MSM manage customer-supplied material?',
        a: 'Yes. Customer stock is tracked separately from your own stock, company-wise, with its own receipts, issues and balances.',
      },
      {
        q: 'Does inventory link to purchases and dispatch?',
        a: 'Yes. Purchases add to stock and log an expense automatically, and each dispatch reduces the specific receipt it consumed for full traceability.',
      },
    ],
    related: [
      'purchase-management',
      'production-management',
      'tool-room-management',
      'reports-analytics',
    ],
  },
  {
    slug: 'purchase-management',
    kind: 'feature',
    name: 'Purchase Management',
    title: `Purchase Management Software | ${BRAND}`,
    h1: 'Purchase management software for manufacturers',
    metaDescription:
      'Record material and tool purchases, manage vendors and subcontracting, and track shop-floor expenses — each purchase adds to stock and the ledger in one step.',
    keywords: [
      'purchase management software',
      'procurement software',
      'vendor management',
      'material purchase tracking',
    ],
    intro:
      'Capture every rupee that leaves the shop and keep stores in sync. MSM records material and tool purchases as line-item purchases that feed stock and the accounts ledger together, alongside vendor and subcontracting management.',
    sections: [
      {
        h2: 'Multi-line material and tool purchases',
        body: 'Buy several materials — or several tools such as inserts, drills and taps — in a single purchase record. Each line is added to stock and the whole purchase is logged as one expense.',
        bullets: [
          'One combined expense per purchase, with per-line breakdown',
          'Material purchases feed own stock; tool purchases feed the tool room',
          'Category summaries and a payee/receiver on every entry',
        ],
      },
      {
        h2: 'Vendors and subcontracting',
        body: 'Keep a vendor master and coordinate subcontracting — send material out and receive finished work back — without losing the paper trail.',
      },
      {
        h2: 'Expenses that reconcile',
        body: 'Shop-floor expenses can be imported from bank statements and reviewed, so what you spent and what the bank shows always agree.',
      },
    ],
    benefits: [
      'No double entry between stores and accounts',
      'Clear spend visibility by category and payee',
      'Bank-reconciled expenses you can trust',
    ],
    faqs: [
      {
        q: 'Can I buy multiple items in one purchase?',
        a: 'Yes. Both material and tool purchases support a multi-line grid, recorded as one combined expense with a per-line breakdown.',
      },
      {
        q: 'Do purchases update stock automatically?',
        a: 'Yes. A material purchase adds to own stock and a tool purchase adds to tool-room stock, each logging the expense at the same time.',
      },
    ],
    related: [
      'inventory-management',
      'tool-room-management',
      'accounting-gst',
      'job-work-management',
    ],
  },
  {
    slug: 'sales-invoicing',
    kind: 'feature',
    name: 'Sales & Invoicing',
    title: `Sales & GST Invoicing Software | ${BRAND}`,
    h1: 'Sales, invoicing and delivery challan software',
    metaDescription:
      'Generate GST-ready invoices and delivery challans linked to the job, track payments and receivables, and manage customers company-wise with MSM.',
    keywords: [
      'invoicing software',
      'GST invoice software',
      'delivery challan software',
      'sales management software',
    ],
    intro:
      'Bill accurately and get paid faster. MSM turns dispatches into GST-ready invoices and delivery challans that link straight back to the job, and tracks payments and receivables company-wise.',
    sections: [
      {
        h2: 'GST-ready invoices and challans',
        body: 'Generate invoices and delivery challans in seconds, each linked to the originating job and the stock it dispatched, so your documents and your records never disagree.',
        bullets: [
          'Delivery challans and invoices linked to jobs and stock',
          'Payments and receivables tracked per company',
          'Print-ready documents for dispatch and billing',
        ],
      },
      {
        h2: 'Payments and receivables',
        body: 'Record payments against invoices, watch invoice status move from unpaid to paid, and see who owes what at a glance.',
      },
      {
        h2: 'Company-wise everything',
        body: 'Customers, dispatches, invoices and dues are all organised company-wise, matching how a job shop actually serves multiple clients.',
      },
    ],
    benefits: [
      'Invoices and challans that trace back to the job',
      'Clear receivables so nothing slips',
      'Company-wise billing without spreadsheets',
    ],
    faqs: [
      {
        q: 'Does MSM produce GST invoices?',
        a: 'Yes. Invoices are GST-ready and link back to the job and stock they bill, with e-invoice and e-way bill support in the accounting module.',
      },
      {
        q: 'Can I track receivables per customer?',
        a: 'Yes. Payments record against invoices and dues are tracked company-wise so you always know who owes what.',
      },
    ],
    related: [
      'accounting-gst',
      'production-management',
      'inventory-management',
      'reports-analytics',
    ],
  },
  {
    slug: 'accounting-gst',
    kind: 'feature',
    name: 'Accounting & GST',
    title: `Accounting & GST Software for Manufacturers | ${BRAND}`,
    h1: 'Accounting and GST software for manufacturers',
    metaDescription:
      'A double-entry ledger with chart of accounts, GST returns, e-invoice and e-way bill support, plus bank statement import and reconciliation — built for Indian manufacturers.',
    keywords: [
      'GST accounting software',
      'manufacturing accounting software',
      'e-invoice software',
      'e-way bill software',
      'bank reconciliation software',
    ],
    intro:
      'Keep books that tie back to the shop floor. MSM includes a real double-entry ledger, GST returns, e-invoice and e-way bill support, and bank statement import with reconciliation — so finance reflects operations.',
    sections: [
      {
        h2: 'Double-entry ledger and financial statements',
        body: 'A chart of accounts, journals and general ledger underpin the whole system, so every invoice, payment and expense posts to balanced books you can report on.',
        bullets: [
          'Chart of accounts, journals and general ledger',
          'GST returns, e-invoice and e-way bill support',
          'Bank statement import with reconciliation',
        ],
      },
      {
        h2: 'GST built in',
        body: 'Invoices are GST-ready and the accounting module supports GST returns, e-invoice and e-way bill generation for compliant dispatch and billing.',
      },
      {
        h2: 'Bank reconciliation without the guesswork',
        body: 'Import a bank statement, review each transaction, and post it to payments or expenses — the payee is even read from the transaction narration so records stay meaningful.',
      },
    ],
    benefits: [
      'Books that reconcile to the shop floor',
      'GST, e-invoice and e-way bill in one place',
      'Faster, more accurate bank reconciliation',
    ],
    faqs: [
      {
        q: 'Does MSM support GST, e-invoice and e-way bill?',
        a: 'Yes. The accounting module supports GST returns, e-invoice and e-way bill generation. Always confirm statutory details against current government requirements.',
      },
      {
        q: 'Can I import and reconcile bank statements?',
        a: 'Yes. Bank statements can be imported and each transaction reviewed and posted to the ledger as a payment or expense.',
      },
    ],
    related: [
      'sales-invoicing',
      'purchase-management',
      'reports-analytics',
      'production-management',
    ],
  },
  {
    slug: 'job-work-management',
    kind: 'feature',
    name: 'Job Work Management',
    title: `Job Work Management Software | ${BRAND}`,
    h1: 'Job work and subcontracting management software',
    metaDescription:
      'Manage subcontracting end to end — send material out on a challan, track work in progress at vendors, and receive finished parts back with full traceability.',
    keywords: [
      'job work management software',
      'subcontracting software',
      'job work challan',
      'outward material tracking',
    ],
    intro:
      'Keep control of work that leaves your shop. MSM tracks subcontracting from outward dispatch to inward receipt, so material sent to a vendor is never lost and job-work charges land in the ledger.',
    sections: [
      {
        h2: 'Send out and receive back with a paper trail',
        body: 'Raise subcontracting orders, dispatch material outward on a challan, and record finished work coming back — with quantities and rejections tracked at every step.',
        bullets: [
          'Subcontracting orders with sent, received and rejected quantities',
          'Outward and inward job-work challans',
          'Job-work charges posted as expenses automatically',
        ],
      },
      {
        h2: 'Nothing lost at the vendor',
        body: 'Outstanding quantities at each vendor are visible at a glance, so material sitting outside your shop is always accounted for.',
      },
    ],
    benefits: [
      'Full visibility of material at subcontractors',
      'Accurate job-work costing in the ledger',
      'Traceability across outward and inward movements',
    ],
    faqs: [
      {
        q: 'Can I track material sent to subcontractors?',
        a: 'Yes. Subcontracting orders track sent, received and rejected quantities, with outward and inward challans for a complete paper trail.',
      },
      {
        q: 'Are job-work charges recorded in accounts?',
        a: 'Yes. Job-work charges post as expenses so subcontracting cost is reflected in your books.',
      },
    ],
    related: [
      'purchase-management',
      'production-management',
      'inventory-management',
      'accounting-gst',
    ],
  },
  {
    slug: 'tool-room-management',
    kind: 'feature',
    name: 'Tool Room Management',
    title: `Tool Room Management Software | ${BRAND}`,
    h1: 'Tool room management software',
    metaDescription:
      'Track cutting tools and gauges through issue, return, maintenance and calibration. Transaction-driven tool inventory keeps availability accurate and audit-ready.',
    keywords: [
      'tool room management software',
      'tool crib software',
      'tool inventory software',
      'calibration tracking',
    ],
    intro:
      'Give the tool room the same discipline as the rest of the shop. MSM tracks every tool through receipt, issue, return, maintenance, calibration and scrap, so availability is always accurate and never edited by hand.',
    sections: [
      {
        h2: 'Transaction-driven tool inventory',
        body: 'Every movement — receipt, issue, return, transfer, maintenance, calibration, scrap — is a ledger transaction, so tool availability is derived and can never silently drift.',
        bullets: [
          'Issue and return tools against jobs and machines',
          'Maintenance and calibration schedules with due dates',
          'Reservations and reorder levels for consumables',
        ],
      },
      {
        h2: 'Buy tools as a purchase',
        body: 'Tool purchases (inserts, drills, taps and more) are recorded like any other purchase — the quantity is added to tool-room stock and the spend is logged as an expense.',
      },
    ],
    benefits: [
      'Accurate, tamper-proof tool availability',
      'Calibration and maintenance never missed',
      'Tool spend visible alongside other purchases',
    ],
    faqs: [
      {
        q: 'Can MSM track tool issue and return?',
        a: 'Yes. Tools move through issue, return, maintenance, calibration and scrap as ledger transactions, so availability is always accurate.',
      },
      {
        q: 'Does it handle calibration and maintenance?',
        a: 'Yes. Tools can carry maintenance and calibration schedules with due dates and pass/fail results.',
      },
    ],
    related: [
      'inventory-management',
      'purchase-management',
      'production-management',
      'reports-analytics',
    ],
  },
  {
    slug: 'workforce-hrm',
    kind: 'feature',
    name: 'Workforce & HRM',
    title: `Workforce & HR Management Software | ${BRAND}`,
    h1: 'Workforce and HR management for manufacturers',
    metaDescription:
      'Manage employees, attendance, leave and payroll alongside the shop floor. MSM keeps your workforce records in the same system as production and accounts.',
    keywords: [
      'HR management software',
      'manufacturing HR software',
      'attendance software',
      'payroll software',
    ],
    intro:
      'Run your people the way you run your parts. The HRM module keeps employees, attendance, leave and payroll in the same system as production and accounts, with role-based access throughout.',
    sections: [
      {
        h2: 'People records in one place',
        body: 'Maintain employees, departments and designations, track attendance and leave, and run payroll — all connected to the same secure, role-based platform as the rest of MSM.',
        bullets: [
          'Employee, department and designation masters',
          'Attendance, shifts, holidays and leave',
          'Payroll with structures and periods',
        ],
      },
      {
        h2: 'Role-based access',
        body: 'Permissions control who can see and do what, so sensitive workforce and payroll data stays with the people you authorise.',
      },
    ],
    benefits: [
      'One system for people, production and accounts',
      'Role-based access to sensitive HR data',
      'Less duplicate data entry across teams',
    ],
    faqs: [
      {
        q: 'Does MSM include HR and payroll?',
        a: 'Yes. The HRM module covers employees, attendance, leave and payroll, secured by role-based permissions.',
      },
    ],
    related: ['reports-analytics', 'production-management', 'accounting-gst'],
  },
  {
    slug: 'reports-analytics',
    kind: 'feature',
    name: 'Reports & Analytics',
    title: `Manufacturing Reports & Analytics | ${BRAND}`,
    h1: 'Reports and analytics for your shop floor',
    metaDescription:
      'See jobs, dispatches, stock, dues and margins at a glance. MSM turns live operational data into dashboards and reports across every module.',
    keywords: [
      'manufacturing reports software',
      'shop floor analytics',
      'production reports',
      'inventory reports',
    ],
    intro:
      'Make decisions on live data, not month-old spreadsheets. Because every module writes to one database, MSM can show jobs, dispatches, stock, dues and margins across the whole shop in real time.',
    sections: [
      {
        h2: 'Dashboards across every module',
        body: 'Live dashboards summarise operations, inventory and finance, while detailed reports let you drill into jobs, stock movements, receivables and expenses.',
        bullets: [
          'Operational, inventory and financial dashboards',
          'Drill-down reports by job, company, material and date',
          'Export to Excel for sharing and further analysis',
        ],
      },
      {
        h2: 'One dataset, no reconciliation',
        body: 'Reports read the same records that run the shop, so the numbers on a dashboard always match the underlying documents.',
      },
    ],
    benefits: [
      'Real-time visibility across the shop',
      'Numbers that always tie back to documents',
      'Easy Excel export for sharing',
    ],
    faqs: [
      {
        q: 'Are reports based on live data?',
        a: 'Yes. Every module writes to one database, so dashboards and reports reflect the current state of the shop.',
      },
      {
        q: 'Can I export reports?',
        a: 'Yes. Reports and summaries can be exported to Excel.',
      },
    ],
    related: ['production-management', 'inventory-management', 'accounting-gst', 'sales-invoicing'],
  },
]

export const INDUSTRIES: Solution[] = [
  {
    slug: 'machine-shops',
    kind: 'industry',
    name: 'Machine Shops',
    title: `ERP Software for Machine Shops | ${BRAND}`,
    h1: 'Manufacturing software built for machine shops',
    metaDescription:
      'Purpose-built for precision machine shops: job orders, material traceability, GST invoicing and delivery challans, company-wise from order to dispatch.',
    keywords: ['machine shop management software', 'machine shop ERP', 'job shop software'],
    intro:
      'MSM is built around how a precision machine shop actually works — jobs come in per company, material is tracked to the receipt, and every part is dispatched with a challan and invoice that trace back to the job.',
    sections: [
      {
        h2: 'Made for company-wise job work',
        body: 'Machine shops juggle many customers at once. MSM organises jobs, stock, dispatches and dues company-wise, so a busy shop keeps every client’s work cleanly separated.',
      },
      {
        h2: 'Traceability your customers expect',
        body: 'From raw material receipt to delivered part, every job carries a full history — ready for the audits and quality documentation precision customers demand.',
      },
    ],
    benefits: [
      'Company-wise jobs, stock and billing',
      'Order-to-dispatch traceability on every part',
      'GST-ready invoices and delivery challans',
    ],
    faqs: [
      {
        q: 'Is MSM suitable for a small machine shop?',
        a: 'Yes. MSM is designed for machine shops of all sizes and can be started with a free trial, importing your existing records to get going quickly.',
      },
      {
        q: 'Does it handle customer-supplied material?',
        a: 'Yes. Customer material is tracked separately from your own stock, company-wise, with full receipt and dispatch history.',
      },
    ],
    related: ['cnc-machining', 'engineering-job-work', 'precision-fabrication'],
  },
  {
    slug: 'cnc-machining',
    kind: 'industry',
    name: 'CNC Machining',
    title: `Software for CNC Machining Shops | ${BRAND}`,
    h1: 'Management software for CNC machining shops',
    metaDescription:
      'Run a CNC turning and milling shop on one system: job orders, batch and material traceability, documented dispatch and GST invoicing with MSM.',
    keywords: ['CNC machining software', 'CNC shop software', 'CNC job shop management'],
    intro:
      'CNC shops live and die by precision and repeatability. MSM keeps the paperwork just as tight as the tolerances — every job, material batch and dispatch is recorded and linked, so quality is provable.',
    sections: [
      {
        h2: 'Repeatability, on the record',
        body: 'Track each job order, the material it consumed and the parts it produced, so a repeat order can be run against the same documented process and traceable stock.',
      },
      {
        h2: 'Turning, milling and everything after',
        body: 'From first-off to final inspection and dispatch, MSM follows the real CNC workflow and turns it into GST-ready invoices and challans linked to the job.',
      },
    ],
    benefits: [
      'Batch and material traceability for every part',
      'Documented, repeatable job history',
      'Dispatch and billing linked to the job',
    ],
    faqs: [
      {
        q: 'Does MSM suit CNC turning and milling shops?',
        a: 'Yes. MSM follows the CNC workflow from job order through machining to dispatch and invoicing, with material and batch traceability throughout.',
      },
    ],
    related: ['machine-shops', 'engineering-job-work', 'auto-components'],
  },
  {
    slug: 'precision-fabrication',
    kind: 'industry',
    name: 'Precision Fabrication',
    title: `Software for Precision Fabrication Shops | ${BRAND}`,
    h1: 'Management software for precision fabrication',
    metaDescription:
      'Manage fabrication jobs, raw material and subcontracting in one place, with GST invoicing and delivery challans linked to every job — powered by MSM.',
    keywords: [
      'fabrication software',
      'sheet metal fabrication software',
      'fabrication job management',
    ],
    intro:
      'Fabrication mixes in-house work with subcontracting and a lot of raw material. MSM keeps material, job work and dispatch connected so a fabrication shop always knows what is where and what it cost.',
    sections: [
      {
        h2: 'Material and subcontracting under control',
        body: 'Track raw material to the receipt and manage subcontracting outward and inward, so material sent for processes like plating or cutting is never lost.',
      },
      {
        h2: 'From cut to dispatch',
        body: 'Follow each fabrication job to a documented dispatch and GST invoice, with costs — including job-work charges — reflected in the ledger.',
      },
    ],
    benefits: [
      'Raw material and offcuts accounted for',
      'Subcontracting tracked outward and inward',
      'Job costs reflected in the books',
    ],
    faqs: [
      {
        q: 'Can MSM handle subcontracting for fabrication?',
        a: 'Yes. The job work module tracks material sent to and received from subcontractors, with charges posted to accounts.',
      },
    ],
    related: ['machine-shops', 'engineering-job-work', 'cnc-machining'],
  },
  {
    slug: 'engineering-job-work',
    kind: 'industry',
    name: 'Engineering Job Work',
    title: `Software for Engineering Job Work | ${BRAND}`,
    h1: 'Software for engineering job-work manufacturers',
    metaDescription:
      'Built for job-work and contract manufacturers: track customer material, subcontracting and dispatch company-wise, with GST invoicing that ties to each job.',
    keywords: [
      'job work software',
      'contract manufacturing software',
      'engineering job work management',
    ],
    intro:
      'Job-work manufacturers process other people’s material against tight commitments. MSM tracks customer-supplied stock, in-house and subcontracted work, and dispatch — all company-wise — so nothing is misplaced or mis-billed.',
    sections: [
      {
        h2: 'Customer material, kept honest',
        body: 'Receive customer material into a separate, company-wise stock, consume it against jobs, and dispatch finished parts with challans that trace back to the intake.',
      },
      {
        h2: 'Bill the work, not the guesswork',
        body: 'Because dispatch links to the job and the customer, invoicing job work is fast and accurate, and receivables are clear per company.',
      },
    ],
    benefits: [
      'Company-wise customer-material tracking',
      'Clear job-work billing and receivables',
      'Subcontracting and in-house work in one view',
    ],
    faqs: [
      {
        q: 'Is MSM good for job-work manufacturers?',
        a: 'Yes. MSM is designed for job-work and contract manufacturing, tracking customer material, subcontracting and dispatch company-wise.',
      },
    ],
    related: ['machine-shops', 'precision-fabrication', 'auto-components'],
  },
  {
    slug: 'auto-components',
    kind: 'industry',
    name: 'Auto Components',
    title: `Software for Auto Component Manufacturers | ${BRAND}`,
    h1: 'Software for automotive component manufacturers',
    metaDescription:
      'Manage high-volume component runs with batch traceability, documented quality and dispatch, plus GST invoicing and delivery challans — all in MSM.',
    keywords: [
      'automotive component software',
      'auto parts manufacturing software',
      'component traceability',
    ],
    intro:
      'Automotive component makers run repeat, high-volume work where traceability is non-negotiable. MSM records every batch, material and dispatch so quality is documented and recalls are traceable.',
    sections: [
      {
        h2: 'Batch traceability for repeat runs',
        body: 'Track material to the receipt and parts to the job, so any delivered batch can be traced back to its material and process history.',
      },
      {
        h2: 'Volume dispatch and billing',
        body: 'Turn repeat dispatches into GST-ready invoices and delivery challans linked to each job, with receivables tracked per customer.',
      },
    ],
    benefits: [
      'Batch and material traceability for recalls',
      'Fast, documented volume dispatch',
      'Company-wise billing and receivables',
    ],
    faqs: [
      {
        q: 'Does MSM support batch traceability?',
        a: 'Yes. Material is tracked to the receipt and parts to the job, so delivered batches can be traced back to their source.',
      },
    ],
    related: ['machine-shops', 'cnc-machining', 'engineering-job-work'],
  },
]

export const ALL_SOLUTIONS: Solution[] = [...FEATURES, ...INDUSTRIES]

const BY_SLUG = new Map(ALL_SOLUTIONS.map((s) => [s.slug, s]))
export function solutionBySlug(slug: string): Solution | undefined {
  return BY_SLUG.get(slug)
}
