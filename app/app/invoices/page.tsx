'use client'

// Portal route /app/invoices (was src/routes/app/invoices.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { InvoicesPage } from '@/features/invoices/InvoicesPage'

export default function Page() {
  return <InvoicesPage />
}
