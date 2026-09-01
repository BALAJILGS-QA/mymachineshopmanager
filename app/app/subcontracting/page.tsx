'use client'

// Portal route /app/subcontracting (was src/routes/app/subcontracting.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { SubcontractingPage } from '@/features/subcontracting/SubcontractingPage'

export default function Page() {
  return <SubcontractingPage />
}
