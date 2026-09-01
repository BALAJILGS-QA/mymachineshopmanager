import { createFileRoute } from '@tanstack/react-router'
import { SalesPage } from '@/features/sales/SalesPage'

export const Route = createFileRoute('/app/sales')({
  component: SalesPage,
})
