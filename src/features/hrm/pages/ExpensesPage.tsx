import { useState } from 'react'
import { Banknote, Receipt } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import {
  useEmployeeAdvances,
  useEmployees,
  useExpenseCategories,
  useExpenseClaims,
} from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import { employeeName } from '../components/employeeUi'
import type { EmployeeAdvance, ExpenseClaim } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { currency, fmtDate, todayISO } from '@/lib/format'

const ADV_TONE: Record<string, string> = {
  pending: 'amber',
  approved: 'blue',
  active: 'blue',
  closed: 'green',
  rejected: 'red',
}
const EXP_TONE: Record<string, string> = {
  draft: 'slate',
  submitted: 'amber',
  approved: 'green',
  rejected: 'red',
  paid: 'green',
}

export function ExpensesPage() {
  const advances = useEmployeeAdvances()
  const claims = useExpenseClaims()
  const categories = useExpenseCategories().list.data ?? []
  const employees = useEmployees().data ?? []
  const perms = usePermissions()
  const [view, setView] = useState<'advances' | 'expenses'>('advances')

  const canAdvance = perms.can('ADVANCE_MANAGE')
  const canExpense = perms.can('EXPENSE_APPROVE')

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? employeeName(e) : id
  }
  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? '—'

  const switcher = (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
      <button
        onClick={() => setView('advances')}
        className={
          'rounded-lg px-3 py-1.5 text-sm font-medium ' +
          (view === 'advances'
            ? 'bg-brand-100 text-brand-800'
            : 'text-slate-500 hover:bg-slate-100')
        }
      >
        Advances
      </button>
      <button
        onClick={() => setView('expenses')}
        className={
          'rounded-lg px-3 py-1.5 text-sm font-medium ' +
          (view === 'expenses'
            ? 'bg-brand-100 text-brand-800'
            : 'text-slate-500 hover:bg-slate-100')
        }
      >
        Expense Claims
      </button>
    </div>
  )

  const advCols: DataTableColumn<EmployeeAdvance>[] = [
    {
      key: 'emp',
      header: 'Employee',
      cellClassName: 'font-semibold',
      render: (a) => empName(a.employeeId),
    },
    {
      key: 'amount',
      header: 'Amount',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (a) => currency(a.amount),
    },
    {
      key: 'out',
      header: 'Outstanding',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (a) => currency(a.outstanding),
    },
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'text-xs',
      render: (a) => fmtDate(a.advanceDate),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <Badge tone={ADV_TONE[a.status] ?? 'slate'}>{a.status}</Badge>,
    },
  ]

  const expCols: DataTableColumn<ExpenseClaim>[] = [
    {
      key: 'emp',
      header: 'Employee',
      cellClassName: 'font-semibold',
      render: (c) => empName(c.employeeId),
    },
    { key: 'cat', header: 'Category', render: (c) => catName(c.categoryId) },
    {
      key: 'amount',
      header: 'Amount',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (c) => currency(c.amount),
    },
    { key: 'date', header: 'Date', cellClassName: 'text-xs', render: (c) => fmtDate(c.claimDate) },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge tone={EXP_TONE[c.status] ?? 'slate'}>{c.status}</Badge>,
    },
  ]

  if (view === 'advances') {
    return (
      <MasterManager<EmployeeAdvance>
        title="Advances & Expenses"
        subtitle="Salary advances and reimbursable expense claims"
        addLabel="New Advance"
        emptyIcon={<Banknote size={40} />}
        emptyTitle="No advances"
        rows={advances.list.data ?? []}
        loading={advances.list.isLoading}
        columns={advCols}
        canWrite={canAdvance}
        headerActions={switcher}
        search={(a, q) => empName(a.employeeId).toLowerCase().includes(q)}
        emptyDraft={() => ({ advanceDate: todayISO(), installments: 1, status: 'pending' })}
        toDraft={(a) => ({ ...a })}
        validate={(d) =>
          !d.employeeId ? 'Select an employee' : !d.amount ? 'Amount is required' : null
        }
        onCreate={(d) =>
          advances.create.mutateAsync({
            ...d,
            outstanding: Number(d.amount),
          } as Partial<EmployeeAdvance>)
        }
        onUpdate={(id, d) =>
          advances.update.mutateAsync({ id, patch: d as Partial<EmployeeAdvance> })
        }
        onDelete={(a) => advances.remove.mutateAsync(a.id)}
        renderForm={(draft, patch) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Employee" required className="sm:col-span-2">
              <Select
                value={String(draft.employeeId ?? '')}
                onChange={(e) => patch({ employeeId: e.target.value })}
              >
                <option value="">— Select —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {employeeName(e)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" required>
              <Input
                type="number"
                value={String(draft.amount ?? '')}
                onChange={(e) => patch({ amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Installments">
              <Input
                type="number"
                value={String(draft.installments ?? 1)}
                onChange={(e) => patch({ installments: Number(e.target.value) })}
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={String(draft.advanceDate ?? '')}
                onChange={(e) => patch({ advanceDate: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <Select
                value={String(draft.status ?? 'pending')}
                onChange={(e) => patch({ status: e.target.value })}
              >
                {['pending', 'approved', 'active', 'closed', 'rejected'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={String(draft.reason ?? '')}
                onChange={(e) => patch({ reason: e.target.value })}
              />
            </Field>
          </div>
        )}
      />
    )
  }

  return (
    <MasterManager<ExpenseClaim>
      title="Advances & Expenses"
      subtitle="Salary advances and reimbursable expense claims"
      addLabel="New Claim"
      emptyIcon={<Receipt size={40} />}
      emptyTitle="No expense claims"
      rows={claims.list.data ?? []}
      loading={claims.list.isLoading}
      columns={expCols}
      canWrite={canExpense}
      headerActions={switcher}
      search={(c, q) => empName(c.employeeId).toLowerCase().includes(q)}
      emptyDraft={() => ({ claimDate: todayISO(), status: 'submitted' })}
      toDraft={(c) => ({ ...c })}
      validate={(d) =>
        !d.employeeId ? 'Select an employee' : !d.amount ? 'Amount is required' : null
      }
      onCreate={(d) => claims.create.mutateAsync(d as Partial<ExpenseClaim>)}
      onUpdate={(id, d) => claims.update.mutateAsync({ id, patch: d as Partial<ExpenseClaim> })}
      onDelete={(c) => claims.remove.mutateAsync(c.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Employee" required className="sm:col-span-2">
            <Select
              value={String(draft.employeeId ?? '')}
              onChange={(e) => patch({ employeeId: e.target.value })}
            >
              <option value="">— Select —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeName(e)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select
              value={String(draft.categoryId ?? '')}
              onChange={(e) => patch({ categoryId: e.target.value || undefined })}
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" required>
            <Input
              type="number"
              value={String(draft.amount ?? '')}
              onChange={(e) => patch({ amount: Number(e.target.value) })}
            />
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={String(draft.claimDate ?? '')}
              onChange={(e) => patch({ claimDate: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select
              value={String(draft.status ?? 'submitted')}
              onChange={(e) => patch({ status: e.target.value })}
            >
              {['draft', 'submitted', 'approved', 'rejected', 'paid'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={String(draft.description ?? '')}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
        </div>
      )}
    />
  )
}
