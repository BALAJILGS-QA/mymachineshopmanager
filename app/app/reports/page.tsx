'use client'

// Portal route /app/reports (was src/routes/app/reports.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { ReportsPage } from '@/features/reports/ReportsPage'

export default function Page() {
  return <ReportsPage />
}
