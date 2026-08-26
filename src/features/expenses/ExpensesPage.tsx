import { useMemo, useState } from 'react'
import { Download, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import type { Expense, PaymentMethod } from '@/types'
import { expenseRepo, previewNextNo, BusinessRuleError } from '@/data/repo'
import { useDb } from '@/data/store'
import { currency, fmtDate, todayISO } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import {
  CompanyFilter,
  DateRangeFilter,
  FilterBar,
  SearchBox,
  inRange,
} from '@/components/common/Filters'
import { Modal } from '@/components/ui/Modal'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName, useJobNo } from '@/features/shared/lookups'
import { PAYMENT_METHODS as METHODS } from '@/constants/domain'

export function ExpensesPage() {
  const expenses = useDb((db) => db.expenses)
  const categories = useDb((db) => db.settings.expenseCategories)
  const companyName = useCompanyName()
  const jobNo = useJobNo()
  const toast = useToast()
  const confirm = useConfirm()

  const [editing, setEditing] = useState<Expense | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return expenses
      .filter((e) => {
        if (company && e.companyId !== company) return false
        if (category && e.category !== category) return false
        if (!inRange(e.date, from, to)) return false
        if (s && !`${e.expenseNo} ${e.vendor ?? ''} ${e.category}`.toLowerCase().includes(s))
          return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [expenses, company, category, from, to, search])

  const total = rows.reduce((s, e) => s + e.amount, 0)
  const pg = usePagination(rows)

  async function del(e: Expense) {
    const ok = await confirm({ message: `Delete expense ${e.expenseNo}?`, danger: true })
    if (!ok) return
    expenseRepo.remove(e.id)
    toast.success('Expense deleted')
  }

  function exportCsv() {
    downloadCsv('expenses', rows, [
      { header: 'Expense', value: (e) => e.expenseNo },
      { header: 'Date', value: (e) => e.date },
      { header: 'Category', value: (e) => e.category },
      { header: 'Amount', value: (e) => e.amount },
      { header: 'Method', value: (e) => e.method },
      { header: 'Vendor', value: (e) => e.vendor ?? '' },
      { header: 'Company', value: (e) => companyName(e.companyId) },
      { header: 'Job', value: (e) => jobNo(e.jobId) },
    ])
  }

  return (
    <div>
      <PageHeader
        title="Shop-Floor Expenses"
        subtitle={`${rows.length} shown · ${currency(total)}`}
        actions={
          <>
            <button className="btn-secondary" onClick={exportCsv}>
              <Download size={16} /> CSV
            </button>
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> Add Expense
            </button>
          </>
        }
      />

      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search vendor, category…" />
        <div>
          <label className="label">Category</label>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-w-[10rem]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <CompanyFilter value={company} onChange={setCompany} />
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Receipt size={40} />} title="No expenses recorded" />
        ) : (
          <ResponsiveTable>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Expense</th>
                <th className="th">Date</th>
                <th className="th">Category</th>
                <th className="th text-right">Amount</th>
                <th className="th">Method</th>
                <th className="th">Vendor</th>
                <th className="th">Company / Job</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pg.pageItems.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono text-xs text-slate-500">{e.expenseNo}</td>
                  <td className="td">{fmtDate(e.date)}</td>
                  <td className="td font-medium">{e.category}</td>
                  <td className="td text-right font-semibold">{currency(e.amount)}</td>
                  <td className="td">{e.method}</td>
                  <td className="td">{e.vendor || '—'}</td>
                  <td className="td text-2xs text-slate-500">
                    {e.companyId ? companyName(e.companyId) : ''}
                    {e.jobId ? ` · ${jobNo(e.jobId)}` : ''}
                    {!e.companyId && !e.jobId ? '—' : ''}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(e)}>
                        <Pencil size={15} />
                      </button>
                      <button className="btn-ghost btn-sm text-red-500" onClick={() => del(e)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
        <Pagination pg={pg} />
      </Card>

      {editing !== undefined && (
        <ExpenseForm expense={editing} onClose={() => setEditing(undefined)} />
      )}
    </div>
  )
}

function ExpenseForm({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const toast = useToast()
  const categories = useDb((db) => db.settings.expenseCategories)
  const companies = useDb((db) => db.companies)
  const jobs = useDb((db) => db.jobs)
  const settings = useDb((db) => db.settings)

  const [form, setForm] = useState({
    date: expense?.date ?? todayISO(),
    category: expense?.category ?? categories[0] ?? '',
    amount: expense?.amount ?? '',
    method: expense?.method ?? ('Cash' as PaymentMethod),
    vendor: expense?.vendor ?? '',
    reference: expense?.reference ?? '',
    companyId: expense?.companyId ?? '',
    jobId: expense?.jobId ?? '',
    notes: expense?.notes ?? '',
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function submit() {
    try {
      const payload = {
        date: form.date,
        category: form.category,
        amount: Number(form.amount),
        method: form.method,
        vendor: form.vendor || undefined,
        reference: form.reference || undefined,
        companyId: form.companyId || undefined,
        jobId: form.jobId || undefined,
        notes: form.notes || undefined,
      }
      if (expense) {
        expenseRepo.update(expense.id, payload)
        toast.success('Expense updated')
      } else {
        expenseRepo.create(payload)
        toast.success('Expense recorded')
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Save failed')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? `Edit ${expense.expenseNo}` : 'Add Expense'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            {expense ? 'Save changes' : 'Record expense'}
          </button>
        </>
      }
    >
      {!expense && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          Expense number will be <b>{previewNextNo('expense', settings.numbering.expense)}</b>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Category" required>
          <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" required>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={form.amount}
            onChange={(e) => set('amount', e.target.value as never)}
          />
        </Field>
        <Field label="Payment Method" required>
          <Select
            value={form.method}
            onChange={(e) => set('method', e.target.value as PaymentMethod)}
          >
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor / Payee">
          <Input value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
        </Field>
        <Field label="Reference">
          <Input value={form.reference} onChange={(e) => set('reference', e.target.value)} />
        </Field>
        <Field label="Company (optional)">
          <Select value={form.companyId} onChange={(e) => set('companyId', e.target.value)}>
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Job (optional)">
          <Select value={form.jobId} onChange={(e) => set('jobId', e.target.value)}>
            <option value="">—</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobNo} — {j.partName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
