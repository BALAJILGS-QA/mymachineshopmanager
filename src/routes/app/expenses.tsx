import { createFileRoute } from '@tanstack/react-router'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'

export const Route = createFileRoute('/app/expenses')({
  component: ExpensesPage,
})
