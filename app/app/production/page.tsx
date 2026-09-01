'use client'

// Portal route /app/production (was src/routes/app/production.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { ProductionPage } from '@/features/production/ProductionPage'

export default function Page() {
  return <ProductionPage />
}
