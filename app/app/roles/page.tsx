'use client'

// Portal route /app/roles — super-admin roles & module-access management.
// Client Component (reuses the shared feature page: React Query + Supabase).

import { RolesPage } from '@/features/access/RolesPage'

export default function Page() {
  return <RolesPage />
}
