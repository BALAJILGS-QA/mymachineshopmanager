import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Download,
  Layers,
  Pencil,
  Plus,
  Receipt,
  Tag,
  Trash2,
  Wallet,
} from 'lucide-react'
import type { Expense, PaymentMethod } from '@/types'
import {
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
} from './hooks/useExpenses'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useMaterials, useCreateOwnPurchase } from '@/features/materials/hooks/useMaterials'
import { useVendors } from '@/features/vendors/hooks/useVendors'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { usePreviewNo } from '@/features/shared/usePreviewNo'
import { toUserMessage } from '@/lib/api/errors'
import {
  currency,
  fmtDate,
  fmtDateTime,
  inRange,
  momDelta,
  prevMonthPrefix,
  todayISO,
} from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { TableSkeleton } from '@/components/common/Skeleton'
import { Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { DateInput } from '@/components/ui/DateInput'
import { CompanyFilter, DateRangeFilter, FilterBar, SearchBox } from '@/components/common/Filters'
import { Modal } from '@/components/ui/Modal'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName, useJobNo } from '@/features/shared/lookups'
import { CASH_WITHDRAWAL_CATEGORY, PAYMENT_METHODS as METHODS } from '@/constants/domain'

// One row per expense category — the aggregated summary shown in the grid. Uses
// the already-filtered expense rows, so the totals always match the underlying
// entries. Clicking a row drills into all entries for that category.
interface CategorySummary {
  category: string
  count: number
  total: number
  thisMonth: number
  lastDate: string
  entries: Expense[]
}

export function ExpensesPage() {
  const { data: expenses = [], isLoading } = useExpenses()
  const settings = useSettings().data
  const settingsCategories = useMemo(
    () => settings?.expenseCategories ?? [],
    [settings?.expenseCategories],
  )
  const deleteExpense = useDeleteExpense()
  const companyName = useCompanyName()
  const jobNo = useJobNo()
  const toast = useToast()
  const confirm = useConfirm()

  const [editing, setEditing] = useState<Expense | null | undefined>(undefined)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // Categories offered in the filter: settings list ∪ categories actually used
  // ∪ the built-in cash-withdrawal category (so it is always selectable).
  const filterCategories = useMemo(() => {
    const set = new Set<string>(settingsCategories)
    set.add(CASH_WITHDRAWAL_CATEGORY)
    for (const e of expenses) set.add(e.category)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [settingsCategories, expenses])

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return expenses
      .filter((e) => {
        if (company && e.companyId !== company) return false
        if (category && e.category !== category) return false
        if (!inRange(e.date, from, to)) return false
        if (
          s &&
          !`${e.expenseNo} ${e.vendor ?? ''} ${e.payee ?? ''} ${e.category}`
            .toLowerCase()
            .includes(s)
        )
          return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [expenses, company, category, from, to, search])

  // Aggregate the filtered rows into one summary per category.
  const summaries = useMemo<CategorySummary[]>(() => {
    const monthPrefix = todayISO().slice(0, 7)
    const map = new Map<string, CategorySummary>()
    for (const e of rows) {
      let c = map.get(e.category)
      if (!c) {
        c = {
          category: e.category,
          count: 0,
          total: 0,
          thisMonth: 0,
          lastDate: e.date,
          entries: [],
        }
        map.set(e.category, c)
      }
      c.count += 1
      c.total += e.amount
      if (e.date.slice(0, 7) === monthPrefix) c.thisMonth += e.amount
      if (e.date > c.lastDate) c.lastDate = e.date
      c.entries.push(e)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [rows])

  const pg = usePagination(summaries)

  // Summary metrics for the current filter selection (§36).
  const stats = useMemo(() => {
    const monthPrefix = todayISO().slice(0, 7)
    const prevPrefix = prevMonthPrefix()
    const total = rows.reduce((s, e) => s + e.amount, 0)
    const sumFor = (prefix: string) =>
      rows.filter((e) => e.date.slice(0, 7) === prefix).reduce((s, e) => s + e.amount, 0)
    const thisMonth = sumFor(monthPrefix)
    const prevMonth = sumFor(prevPrefix)
    return { total, thisMonth, prevMonth, count: rows.length, cats: summaries.length }
  }, [rows, summaries])

  const selectedSummary = useMemo(
    () => summaries.find((s) => s.category === selectedCategory) ?? null,
    [summaries, selectedCategory],
  )
  // If the selected category drops out of the current filters, return to the grid.
  useEffect(() => {
    if (selectedCategory && !selectedSummary) setSelectedCategory(null)
  }, [selectedCategory, selectedSummary])

  async function del(e: Expense) {
    const ok = await confirm({ message: `Delete expense ${e.expenseNo}?`, danger: true })
    if (!ok) return
    try {
      await deleteExpense.mutateAsync(e.id)
      toast.success('Expense deleted')
    } catch (err) {
      toast.error(toUserMessage(err, 'Delete failed'))
    }
  }

  function exportExcel() {
    downloadXlsx(
      'expenses-summary',
      summaries,
      [
        { header: 'Category', value: (s) => s.category, width: 24 },
        { header: 'Entries', value: (s) => s.count, width: 10 },
        { header: 'This Month', value: (s) => s.thisMonth, width: 14 },
        { header: 'Total', value: (s) => s.total, width: 14 },
        { header: 'Last Activity', value: (s) => s.lastDate, width: 14 },
      ],
      'Expenses by Category',
    )
  }

  if (selectedSummary) {
    return (
      <>
        <ExpenseCategoryDetail
          summary={selectedSummary}
          onBack={() => setSelectedCategory(null)}
          onEdit={(e) => setEditing(e)}
          onDelete={del}
          companyName={companyName}
          jobNo={jobNo}
        />
        {editing !== undefined && (
          <ExpenseForm expense={editing} onClose={() => setEditing(undefined)} />
        )}
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Purchase Management"
        subtitle="Record material purchases (added to own stock) and other shop-floor expenses"
        actions={
          <>
            <button className="btn-secondary" onClick={exportExcel}>
              <Download size={16} /> Excel
            </button>
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> Add Purchase / Expense
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Wallet size={18} />}
          label="Total (filtered)"
          value={currency(stats.total)}
        />
        <StatTile
          icon={<CalendarClock size={18} />}
          label="This month"
          value={currency(stats.thisMonth)}
          tone="blue"
          hint="vs last month"
          {...momDelta(stats.thisMonth, stats.prevMonth, true)}
        />
        <StatTile icon={<Receipt size={18} />} label="Entries" value={stats.count} tone="slate" />
        <StatTile icon={<Layers size={18} />} label="Categories" value={stats.cats} tone="violet" />
      </div>

      <FilterBar>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search vendor, payee, category…"
        />
        <div>
          <label className="label">Category</label>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-w-[10rem]"
          >
            <option value="">All categories</option>
            {filterCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <CompanyFilter value={company} onChange={setCompany} />
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      {/* Category summary grid — one row per category; click to see every entry. */}
      <Card>
        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : summaries.length === 0 ? (
          <EmptyState icon={<Receipt size={40} />} title="No expenses recorded" />
        ) : (
          <>
            {/* Desktop / tablet: table */}
            <div className="hidden w-full overflow-x-auto md:block">
              <table className="w-full min-w-[44rem] border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="th">Category</th>
                    <th className="th text-right">Entries</th>
                    <th className="th text-right">This Month</th>
                    <th className="th text-right">Total</th>
                    <th className="th">Last Activity</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pg.pageItems.map((s) => (
                    <tr
                      key={s.category}
                      className="cursor-pointer transition-colors hover:bg-slate-50/70"
                      onClick={() => setSelectedCategory(s.category)}
                    >
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                            <Tag size={16} />
                          </span>
                          <span className="font-semibold text-slate-800">{s.category}</span>
                        </div>
                      </td>
                      <td className="td text-right font-medium text-slate-700">{s.count}</td>
                      <td className="td text-right font-medium text-blue-700">
                        {currency(s.thisMonth)}
                      </td>
                      <td className="td text-right">
                        <span className="tnum text-base font-bold text-slate-900">
                          {currency(s.total)}
                        </span>
                      </td>
                      <td className="td text-slate-500">{fmtDate(s.lastDate)}</td>
                      <td className="td text-right">
                        <span className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-700">
                          View details <ChevronRight size={13} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {pg.pageItems.map((s) => (
                <button
                  key={s.category}
                  type="button"
                  onClick={() => setSelectedCategory(s.category)}
                  className="flex w-full flex-col gap-3 p-4 text-left transition-colors active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-slate-800">{s.category}</p>
                    <span className="tnum text-lg font-bold text-slate-900">
                      {currency(s.total)}
                    </span>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="flex gap-4">
                      <div>
                        <p className="text-2xs uppercase tracking-wide text-slate-400">Entries</p>
                        <p className="tnum font-semibold text-slate-700">{s.count}</p>
                      </div>
                      <div>
                        <p className="text-2xs uppercase tracking-wide text-slate-400">
                          This month
                        </p>
                        <p className="tnum font-semibold text-blue-700">{currency(s.thisMonth)}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-700">
                      View details <ChevronRight size={13} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        <Pagination pg={pg} />
      </Card>

      {editing !== undefined && (
        <ExpenseForm expense={editing} onClose={() => setEditing(undefined)} />
      )}
    </div>
  )
}

// Full-page detail for one category: every expense entry in that category (for
// the current filters), with edit / delete actions. Opens when a summary row is
// clicked; "Back" returns to the category grid.
function ExpenseCategoryDetail({
  summary,
  onBack,
  onEdit,
  onDelete,
  companyName,
  jobNo,
}: {
  summary: CategorySummary
  onBack: () => void
  onEdit: (e: Expense) => void
  onDelete: (e: Expense) => void
  companyName: (id?: string) => string
  jobNo: (id?: string) => string
}) {
  const pg = usePagination(summary.entries)

  function exportCategory() {
    downloadXlsx(
      `expenses-${summary.category}`,
      summary.entries,
      [
        { header: 'Expense', value: (e) => e.expenseNo, width: 16 },
        { header: 'Date', value: (e) => e.date, width: 14 },
        { header: 'Amount', value: (e) => e.amount, width: 14 },
        { header: 'Method', value: (e) => e.method, width: 14 },
        { header: 'Payee', value: (e) => e.payee ?? '', width: 20 },
        { header: 'Vendor', value: (e) => e.vendor ?? '', width: 20 },
        { header: 'Reference', value: (e) => e.reference ?? '', width: 16 },
        { header: 'Company', value: (e) => companyName(e.companyId), width: 22 },
        { header: 'Job', value: (e) => jobNo(e.jobId), width: 16 },
      ],
      summary.category.slice(0, 28),
    )
  }

  const kpis = [
    {
      label: 'Total',
      value: currency(summary.total),
      cls: 'text-slate-900',
      chip: 'border-slate-200 bg-slate-50',
    },
    {
      label: 'Entries',
      value: String(summary.count),
      cls: 'text-slate-700',
      chip: 'border-slate-200 bg-slate-50',
    },
    {
      label: 'This month',
      value: currency(summary.thisMonth),
      cls: 'text-blue-700',
      chip: 'border-blue-200 bg-blue-50',
    },
  ]

  return (
    <div>
      <button onClick={onBack} className="btn-ghost btn-sm mb-3 -ml-2">
        <ArrowLeft size={15} /> Back to categories
      </button>
      <PageHeader
        title={summary.category}
        subtitle={`${summary.count} ${summary.count === 1 ? 'entry' : 'entries'} · last activity ${fmtDate(summary.lastDate)}`}
        actions={
          <button className="btn-ghost btn-sm" onClick={exportCategory}>
            <Download size={15} /> Export Excel
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={clsx('rounded-xl border px-4 py-3', k.chip)}>
            <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
              {k.label}
            </p>
            <p className={clsx('tnum mt-0.5 text-xl font-bold', k.cls)}>{k.value}</p>
          </div>
        ))}
      </div>

      <Card>
        <ResponsiveTable>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">Expense</th>
              <th className="th">Date</th>
              <th className="th text-right">Amount</th>
              <th className="th">Method</th>
              <th className="th">Payee</th>
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
                <td className="td text-right font-semibold">{currency(e.amount)}</td>
                <td className="td">{e.method}</td>
                <td className="td">{e.payee || '—'}</td>
                <td className="td">{e.vendor || '—'}</td>
                <td className="td text-2xs text-slate-500">
                  {e.companyId ? companyName(e.companyId) : ''}
                  {e.jobId ? ` · ${jobNo(e.jobId)}` : ''}
                  {!e.companyId && !e.jobId ? '—' : ''}
                </td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <button className="btn-ghost btn-sm" onClick={() => onEdit(e)}>
                      <Pencil size={15} />
                    </button>
                    <button className="btn-ghost btn-sm text-red-500" onClick={() => onDelete(e)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
        <Pagination pg={pg} />
      </Card>
    </div>
  )
}

function ExpenseForm({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const toast = useToast()
  const settings = useSettings().data
  // Always offer the built-in cash-withdrawal category, even on installs whose
  // saved settings predate it.
  const categories = useMemo(() => {
    const list = [...(settings?.expenseCategories ?? [])]
    if (!list.includes(CASH_WITHDRAWAL_CATEGORY)) list.push(CASH_WITHDRAWAL_CATEGORY)
    return list
  }, [settings?.expenseCategories])
  const { data: companies = [] } = useCompanies()
  const { data: jobs = [] } = useJobs()
  const { data: allMaterials = [] } = useMaterials()
  // A purchase feeds OWN (shop) stock, so only own/shared materials qualify.
  const materials = allMaterials.filter((m) => m.active && !m.companyId)
  const { data: allVendors = [] } = useVendors()
  const vendors = allVendors.filter((v) => v.active)
  const expenseNoPreview = usePreviewNo('expense')
  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const createPurchase = useCreateOwnPurchase()
  const saving = createExpense.isPending || updateExpense.isPending || createPurchase.isPending

  // New entries pick a mode; editing an existing row stays an expense edit.
  const [mode, setMode] = useState<'purchase' | 'expense'>(expense ? 'expense' : 'purchase')

  // Shared fields (both modes).
  const [form, setForm] = useState({
    date: expense?.date ?? '',
    category: expense?.category ?? categories[0] ?? '',
    amount: expense?.amount ?? '',
    method: expense?.method ?? ('Cash' as PaymentMethod),
    vendor: expense?.vendor ?? '',
    payee: expense?.payee ?? '',
    reference: expense?.reference ?? '',
    companyId: expense?.companyId ?? '',
    jobId: expense?.jobId ?? '',
    notes: expense?.notes ?? '',
  })
  // Purchase-only fields.
  const [pur, setPur] = useState({ materialId: '', quantity: '', totalCost: '', totalGst: '' })
  const purMaterial = materials.find((m) => m.id === pur.materialId)
  const purTotal = (Number(pur.totalCost) || 0) + (Number(pur.totalGst) || 0)

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }
  function setP<K extends keyof typeof pur>(k: K, v: (typeof pur)[K]) {
    setPur((p) => ({ ...p, [k]: v }))
  }

  async function submit() {
    try {
      // --- Material purchase: adds to own stock + records the expense (atomic). ---
      if (!expense && mode === 'purchase') {
        if (!pur.materialId) return toast.error('Select a material')
        const q = Number(pur.quantity)
        if (!(q > 0)) return toast.error('Quantity must be greater than zero')
        await createPurchase.mutateAsync({
          supplier: form.vendor || undefined,
          materialId: pur.materialId,
          purchaseDate: form.date,
          quantity: q,
          unit: purMaterial?.unit ?? 'Nos',
          totalCost: Number(pur.totalCost) || 0,
          totalGst: Number(pur.totalGst) || 0,
          method: form.method,
          notes: form.notes || undefined,
        })
        toast.success('Material purchased — added to own stock')
        onClose()
        return
      }

      // --- Other expense (or editing an existing expense). ---
      const payload = {
        date: form.date,
        category: form.category,
        amount: Number(form.amount),
        method: form.method,
        vendor: form.vendor || undefined,
        payee: form.payee || undefined,
        reference: form.reference || undefined,
        companyId: form.companyId || undefined,
        jobId: form.jobId || undefined,
        notes: form.notes || undefined,
      }
      if (expense) {
        await updateExpense.mutateAsync({ id: expense.id, patch: payload })
        toast.success('Expense updated')
      } else {
        await createExpense.mutateAsync(payload)
        toast.success('Expense recorded')
      }
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  const isPurchase = !expense && mode === 'purchase'

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? `Edit ${expense.expenseNo}` : 'Add Purchase / Expense'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving
              ? 'Saving…'
              : expense
                ? 'Save changes'
                : isPurchase
                  ? 'Record purchase'
                  : 'Record expense'}
          </button>
        </>
      }
    >
      {expense && (
        <p className="mb-3 text-right text-2xs text-slate-500">
          Last updated {fmtDateTime(expense.updatedAt)}
        </p>
      )}

      {/* Mode toggle (new entries only). */}
      {!expense && (
        <div className="mb-3">
          <div className="inline-flex rounded-lg bg-slate-200/60 p-1">
            {(
              [
                { k: 'purchase', label: 'Material Purchase' },
                { k: 'expense', label: 'Other Expense' },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                type="button"
                className={
                  'rounded-md px-3 py-1 text-sm font-medium transition ' +
                  (mode === t.k ? 'bg-white text-brand-700 shadow' : 'text-slate-600')
                }
                onClick={() => setMode(t.k)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            {isPurchase
              ? 'Records a raw-material purchase — the quantity is added to Own stock (visible in Materials & Stock → Own) and logged as an expense.'
              : `Expense number will be ${expenseNoPreview}`}
          </p>
        </div>
      )}

      {isPurchase ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Purchase Date" required>
            <DateInput value={form.date} onChange={(v) => set('date', v)} />
          </Field>
          <Field
            label="Supplier / Vendor"
            hint={vendors.length ? 'Pick from the vendor master' : ''}
          >
            {vendors.length ? (
              <Select value={form.vendor} onChange={(e) => set('vendor', e.target.value)}>
                <option value="">Select vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
            )}
          </Field>
          <Field label="Material" required className="sm:col-span-2">
            <Select value={pur.materialId} onChange={(e) => setP('materialId', e.target.value)}>
              <option value="">Select material…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Quantity ${purMaterial ? `(${purMaterial.unit})` : ''}`} required>
            <Input
              type="number"
              step="0.001"
              min={0}
              value={pur.quantity}
              onChange={(e) => setP('quantity', e.target.value)}
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
          <Field label="Material Cost (₹)" required>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={pur.totalCost}
              onChange={(e) => setP('totalCost', e.target.value)}
            />
          </Field>
          <Field label="GST (₹)">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={pur.totalGst}
              onChange={(e) => setP('totalGst', e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">Total (cost + GST)</span>
            <span className="font-semibold text-slate-900">{currency(purTotal)}</span>
          </div>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <DateInput value={form.date} onChange={(v) => set('date', v)} />
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
          <Field
            label="Payee (Receiver name)"
            hint="Who the money was paid to — e.g. self for a cash withdrawal"
          >
            <Input
              value={form.payee}
              onChange={(e) => set('payee', e.target.value)}
              placeholder="e.g. Self / person or firm paid"
            />
          </Field>
          <Field label="Vendor / Supplier">
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
      )}
    </Modal>
  )
}
