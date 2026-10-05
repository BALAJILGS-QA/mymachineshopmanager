'use client'

// Portal route /app/subscription — plan selection & trial status.
// Client Component (reuses the shared feature page: React Query + Supabase RPCs).

import { SubscriptionPage } from '@/features/subscription/SubscriptionPage'

export default function Page() {
  return <SubscriptionPage />
}
