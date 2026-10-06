'use client'

// Portal route /app/jobs/[jobId] — the Production Order object page (Phase 2).
// Client Component; reuses the shared feature page (React Query + Supabase).

import { useParams } from 'next/navigation'
import { ProductionOrderPage } from '@/features/jobs/ProductionOrderPage'

export default function Page() {
  const params = useParams<{ jobId: string }>()
  return <ProductionOrderPage jobId={params?.jobId ?? ''} />
}
