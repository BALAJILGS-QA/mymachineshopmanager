// Expenses data-access (service) layer. Async by contract; delegates to
// expenseRepo today, re-pointed at Supabase in phase 5b.

import { expenseRepo } from '@/data/repo'
import type { Expense } from '@/types'

export type ExpenseCreateInput = Parameters<typeof expenseRepo.create>[0]
export type ExpenseUpdateInput = Parameters<typeof expenseRepo.update>[1]

export async function listExpenses(): Promise<Expense[]> {
  return expenseRepo.list()
}

export async function createExpense(input: ExpenseCreateInput): Promise<Expense> {
  return expenseRepo.create(input)
}

export async function updateExpense(id: string, patch: ExpenseUpdateInput): Promise<Expense> {
  return expenseRepo.update(id, patch)
}

export async function deleteExpense(id: string): Promise<void> {
  expenseRepo.remove(id)
}
