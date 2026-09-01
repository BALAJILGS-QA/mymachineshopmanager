import { createFileRoute } from '@tanstack/react-router'
import { ModuleHub } from '@/features/hub/ModuleHub'

export const Route = createFileRoute('/app/configuration')({
  component: () => (
    <ModuleHub
      title="Configuration & Settings"
      subtitle="Companies, user approvals, reports and shop settings"
    />
  ),
})
