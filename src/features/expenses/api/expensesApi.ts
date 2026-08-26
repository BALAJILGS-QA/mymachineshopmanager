// Expenses data-access - Supabase-direct. Simple CRUD; expense_no from the
// server counter. amount>0 / category are enforced by schema constraints.

import { uid } from '@/lib/id'
import { maps } from '@/lib/api/rowMap'
import { selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { nextNumberedDoc } from '@/lib/api/numbering'
import type { Expense } from '@/types'

export type ExpenseCreateInput = Omit<Expense, 'id' | 'expenseNo' | 'createdAt' | 'updatedAt'>
export type ExpenseUpdateInput = Partial<Expense>

export async function listExpenses(): Promise<Expense[]> {
  return selectAll<Expense>(maps.expenses)
}

export async function createExpense(input: ExpenseCreateInput): Promise<Expense> {
  return insertRow<Expense>(maps.expenses, {
    ...input,
    id: uid('exp_'),
    expenseNo: await nextNumberedDoc('expense'),
  })
}

export async function updateExpense(id: string, patch: ExpenseUpdateInput): Promise<Expense> {
  return updateRow<Expense>(maps.expenses, id, patch)
}

export async function deleteExpense(id: string): Promise<void> {
  return deleteRow(maps.expenses, id)
}
