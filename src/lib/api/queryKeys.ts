// Central TanStack Query key registry. One place to see/curate every cache key so
// invalidation stays consistent as modules migrate off the localStorage store.

export const qk = {
  companies: {
    all: ['companies'] as const,
    detail: (id: string) => ['companies', id] as const,
  },
  expenses: {
    all: ['expenses'] as const,
    detail: (id: string) => ['expenses', id] as const,
  },
  payments: {
    all: ['payments'] as const,
    detail: (id: string) => ['payments', id] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    detail: (id: string) => ['invoices', id] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    detail: (id: string) => ['jobs', id] as const,
  },
  production: {
    // Production events for a single job.
    events: (jobId: string) => ['production', 'events', jobId] as const,
  },
  materials: {
    all: ['materials'] as const,
    detail: (id: string) => ['materials', id] as const,
  },
  // Stock movements + derived balances. Invalidating `all` (['stock']) is a
  // prefix match that clears receipts/issues/adjustments/ledger together.
  stock: {
    all: ['stock'] as const,
    receipts: ['stock', 'receipts'] as const,
    issues: ['stock', 'issues'] as const,
    adjustments: ['stock', 'adjustments'] as const,
    ledger: ['stock', 'ledger'] as const,
    receiptStock: ['stock', 'receiptStock'] as const,
    ownPurchases: ['stock', 'ownPurchases'] as const,
  },
  deliveries: {
    all: ['deliveries'] as const,
    detail: (id: string) => ['deliveries', id] as const,
  },
  users: {
    all: ['users'] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
  products: {
    all: ['products'] as const,
    detail: (id: string) => ['products', id] as const,
  },
  vendors: {
    all: ['vendors'] as const,
    detail: (id: string) => ['vendors', id] as const,
  },
  subcontracts: {
    all: ['subcontracts'] as const,
    docs: (scId: string) => ['subcontracts', 'docs', scId] as const,
  },
  contacts: {
    all: ['contacts'] as const,
  },
  hrm: {
    access: ['hrm', 'access'] as const,
    departments: ['hrm', 'departments'] as const,
    designations: ['hrm', 'designations'] as const,
    employees: ['hrm', 'employees'] as const,
    employee: (id: string) => ['hrm', 'employees', id] as const,
    shifts: ['hrm', 'shifts'] as const,
    holidays: ['hrm', 'holidays'] as const,
    leaveTypes: ['hrm', 'leaveTypes'] as const,
    leaveBalances: (employeeId?: string) => ['hrm', 'leaveBalances', employeeId ?? 'all'] as const,
    leaveApplications: ['hrm', 'leaveApplications'] as const,
    attendance: ['hrm', 'attendance'] as const,
    salaryComponents: ['hrm', 'salaryComponents'] as const,
    salaryStructures: ['hrm', 'salaryStructures'] as const,
    payrollPeriods: ['hrm', 'payrollPeriods'] as const,
    payrollRuns: (periodId?: string) => ['hrm', 'payrollRuns', periodId ?? 'all'] as const,
    payrollRecords: (runId: string) => ['hrm', 'payrollRecords', runId] as const,
    documentTypes: ['hrm', 'documentTypes'] as const,
    documents: (employeeId?: string) => ['hrm', 'documents', employeeId ?? 'all'] as const,
    assets: ['hrm', 'assets'] as const,
    assetAssignments: ['hrm', 'assetAssignments'] as const,
    advances: ['hrm', 'advances'] as const,
    expenseCategories: ['hrm', 'expenseCategories'] as const,
    expenseClaims: ['hrm', 'expenseClaims'] as const,
    jobOpenings: ['hrm', 'jobOpenings'] as const,
    candidates: ['hrm', 'candidates'] as const,
    performanceCycles: ['hrm', 'performanceCycles'] as const,
    performanceReviews: ['hrm', 'performanceReviews'] as const,
    trainingPrograms: ['hrm', 'trainingPrograms'] as const,
    trainingSessions: ['hrm', 'trainingSessions'] as const,
    roles: ['hrm', 'roles'] as const,
    userRoles: ['hrm', 'userRoles'] as const,
    permissionsCatalog: ['hrm', 'permissionsCatalog'] as const,
    settings: ['hrm', 'settings'] as const,
    auditLog: ['hrm', 'auditLog'] as const,
    notifications: ['hrm', 'notifications'] as const,
  },
  inventory: {
    transfers: ['inventory', 'transfers'] as const,
  },
  toolroom: {
    categories: ['toolroom', 'categories'] as const,
    tools: ['toolroom', 'tools'] as const,
    tool: (id: string) => ['toolroom', 'tools', id] as const,
    inventory: ['toolroom', 'inventory'] as const,
    transactions: (toolId?: string) => ['toolroom', 'transactions', toolId ?? 'all'] as const,
    reservations: ['toolroom', 'reservations'] as const,
    maintenance: ['toolroom', 'maintenance'] as const,
    calibrations: ['toolroom', 'calibrations'] as const,
  },
  fin: {
    accounts: ['fin', 'accounts'] as const,
    fiscalYears: ['fin', 'fiscalYears'] as const,
    periods: ['fin', 'periods'] as const,
    journals: ['fin', 'journals'] as const,
    journalLines: (journalId: string) => ['fin', 'journalLines', journalId] as const,
    generalLedger: ['fin', 'generalLedger'] as const,
    trialBalance: ['fin', 'trialBalance'] as const,
    bankAccounts: ['fin', 'bankAccounts'] as const,
    statementFiles: ['fin', 'statementFiles'] as const,
    bankTxns: (fileId?: string) => ['fin', 'bankTxns', fileId ?? 'all'] as const,
    bankRules: ['fin', 'bankRules'] as const,
    partyAliases: ['fin', 'partyAliases'] as const,
    gstRegistrations: ['fin', 'gstRegistrations'] as const,
    gstTaxRates: ['fin', 'gstTaxRates'] as const,
    hsnCodes: ['fin', 'hsnCodes'] as const,
    gstReturns: ['fin', 'gstReturns'] as const,
    einvoices: ['fin', 'einvoices'] as const,
    ewayBills: ['fin', 'ewayBills'] as const,
  },
} as const
