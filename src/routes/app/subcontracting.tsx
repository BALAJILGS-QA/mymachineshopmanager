import { createFileRoute } from '@tanstack/react-router'
import { SubcontractingPage } from '@/features/subcontracting/SubcontractingPage'

export const Route = createFileRoute('/app/subcontracting')({
  component: SubcontractingPage,
})
