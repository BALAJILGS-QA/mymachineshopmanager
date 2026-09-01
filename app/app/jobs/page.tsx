'use client'

// Portal route /app/jobs (was src/routes/app/jobs.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { JobsPage } from '@/features/jobs/JobsPage'

export default function Page() {
  return <JobsPage />
}
