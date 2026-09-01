'use client'

// Portal route /app/companies (was src/routes/app/companies.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { CompaniesPage } from '@/features/companies/CompaniesPage'

export default function Page() {
  return <CompaniesPage />
}
