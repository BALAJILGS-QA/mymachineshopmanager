'use client'

// Portal route /app/approvals (was src/routes/app/approvals.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { ApprovalsPage } from '@/features/approvals/ApprovalsPage'

export default function Page() {
  return <ApprovalsPage />
}
