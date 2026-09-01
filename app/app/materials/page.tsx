'use client'

// Portal route /app/materials (was src/routes/app/materials.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { MaterialsPage } from '@/features/materials/MaterialsPage'

export default function Page() {
  return <MaterialsPage />
}
