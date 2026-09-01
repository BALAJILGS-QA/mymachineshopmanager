'use client'

// Portal route /app/sales (was src/routes/app/sales.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { SalesPage } from '@/features/sales/SalesPage'

export default function Page() {
  return <SalesPage />
}
