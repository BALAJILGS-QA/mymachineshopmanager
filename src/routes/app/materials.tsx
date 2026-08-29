import { createFileRoute } from '@tanstack/react-router'
import { MaterialsPage } from '@/features/materials/MaterialsPage'

export const Route = createFileRoute('/app/materials')({
  component: MaterialsPage,
})
