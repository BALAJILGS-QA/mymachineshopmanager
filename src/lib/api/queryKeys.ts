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
} as const
