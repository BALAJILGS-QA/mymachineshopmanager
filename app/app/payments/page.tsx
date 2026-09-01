'use client'

// Portal route /app/payments (was src/routes/app/payments.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { PaymentsPage } from '@/features/payments/PaymentsPage'

export default function Page() {
  return <PaymentsPage />
}
