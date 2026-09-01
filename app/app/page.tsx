'use client'

// Portal dashboard route `/app` (was src/routes/app/index.tsx → DashboardPage).
// Client Component — DashboardPage uses recharts, React Query hooks and local
// state, all browser-only. The shared DashboardPage is reused as-is (its only
// router coupling, `Link`, was abstracted behind AppLink).

import { DashboardPage } from '@/features/dashboard/DashboardPage'

export default function AppDashboardPage() {
  return <DashboardPage />
}
