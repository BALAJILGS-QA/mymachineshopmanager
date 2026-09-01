'use client'

// Portal route /app/deliveries (was src/routes/app/deliveries.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { DeliveriesPage } from '@/features/deliveries/DeliveriesPage'

export default function Page() {
  return <DeliveriesPage />
}
