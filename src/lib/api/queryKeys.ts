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
  // Stock movements + derived balances (receipts/issues/adjustments).
  stock: {
    all: ['stock'] as const,
  },
  deliveries: {
    all: ['deliveries'] as const,
    detail: (id: string) => ['deliveries', id] as const,
  },
  users: {
    all: ['users'] as const,
  },
} as const
