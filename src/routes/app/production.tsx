import { createFileRoute } from '@tanstack/react-router'
import { ProductionPage } from '@/features/production/ProductionPage'

export const Route = createFileRoute('/app/production')({
  component: ProductionPage,
})
