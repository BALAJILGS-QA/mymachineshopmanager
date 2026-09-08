// QA-Orchestra — canonical module registry (mirrors src/components/layout/nav.ts,
// the user-facing navigation surface). `id` is the slug used for spec + CSV file
// names; `feature` points at the source dir the Phase-1 "understand" step reads.
export interface Module {
  id: string
  route: string
  label: string
  group: string
  feature: string // src/features/<...> dir (best-effort) for the understand phase
  superAdmin?: boolean
}

export const MODULES: Module[] = [
  {
    id: 'dashboard',
    route: '/app',
    label: 'Dashboard',
    group: 'Dashboard',
    feature: 'src/features/dashboard',
  },

  // Production Planning
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

  // Inventory
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

  // Sales / CRM
  {
    id: 'sales',
    route: '/app/sales',
    label: 'Sales',
    group: 'Sales',
    feature: 'src/features/sales',
  },
  { id: 'crm', route: '/app/crm', label: 'CRM', group: 'CRM', feature: 'src/features/crm' },

  // Human Resources
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

  // Accounts & Finance
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

  // Supply Chain
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

  // Configuration & Settings
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

export function moduleById(id: string): Module | undefined {
  return MODULES.find((m) => m.id === id)
}
