import { createFileRoute } from '@tanstack/react-router'
import { ModuleHub } from '@/features/hub/ModuleHub'

export const Route = createFileRoute('/app/accounts')({
  component: () => (
    <ModuleHub
      title="Accounts & Finance"
      subtitle="Purchases, delivery challans, invoices and payments"
    />
  ),
})
