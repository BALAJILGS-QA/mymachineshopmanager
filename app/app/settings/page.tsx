'use client'

// Portal route /app/settings (was src/routes/app/settings.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { SettingsPage } from '@/features/settings/SettingsPage'

export default function Page() {
  return <SettingsPage />
}
