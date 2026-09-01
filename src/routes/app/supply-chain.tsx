import { createFileRoute } from '@tanstack/react-router'
import { ModuleHub } from '@/features/hub/ModuleHub'

export const Route = createFileRoute('/app/supply-chain')({
  component: () => (
    <ModuleHub
      title="Supply Chain"
      subtitle="Vendors and subcontracting (job work sent out to vendors)"
    />
  ),
})
