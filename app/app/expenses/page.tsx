'use client'

// Portal route /app/expenses (was src/routes/app/expenses.tsx). Client Component —
// reuses the shared feature page (React Query + Supabase + browser APIs).

import { ExpensesPage } from '@/features/expenses/ExpensesPage'

export default function Page() {
  return <ExpensesPage />
}
