'use client'

// Portal route /app/production-planning/materials — raw-material + movement tracker
// for production planning. Reuses the inventory stock data layer (no new logic).

import { MaterialTrackerPage } from '@/features/inventory/pages/MaterialTrackerPage'

export default function Page() {
  return <MaterialTrackerPage />
}
