'use client'

// Portal route /app/vendors (was src/routes/app/vendors.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { VendorsPage } from '@/features/vendors/VendorsPage'

export default function Page() {
  return <VendorsPage />
}
