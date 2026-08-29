import { createFileRoute } from '@tanstack/react-router'
import { ReportsPage } from '@/features/reports/ReportsPage'

export const Route = createFileRoute('/app/reports')({
  component: ReportsPage,
})
