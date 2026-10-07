'use client'

// Portal route /app/production-schedule — per-work-centre capacity view over
// pending/in-progress operations. Client Component reusing the shared feature page.

import { ProductionSchedulePage } from '@/features/production/ProductionSchedulePage'

export default function Page() {
  return <ProductionSchedulePage />
}
