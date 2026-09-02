'use client'

// Portal route /app/crm — CRM module listing contact-form enquiries. Client
// Component: reuses the shared feature page (React Query + Supabase + browser).

import { CrmPage } from '@/features/crm/CrmPage'

export default function Page() {
  return <CrmPage />
}
