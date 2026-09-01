import { createFileRoute } from '@tanstack/react-router'
import { ModuleHub } from '@/features/hub/ModuleHub'

export const Route = createFileRoute('/app/production-planning')({
  component: () => (
    <ModuleHub
      title="Production Planning"
      subtitle="Plan and run shop-floor work — job orders, production and material stock"
    />
  ),
})
