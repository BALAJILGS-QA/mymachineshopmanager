// Central TanStack Query key registry. One place to see/great every cache key so
// invalidation stays consistent as modules migrate off the localStorage store.
// Grows one entry per feature as Phase 5 proceeds.

export const qk = {
  companies: {
    all: ['companies'] as const,
    detail: (id: string) => ['companies', id] as const,
  },
} as const
