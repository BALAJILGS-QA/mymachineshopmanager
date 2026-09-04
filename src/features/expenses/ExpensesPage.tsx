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
import {
  useMaterials,
  useCreateMaterial,
  useCreateOwnPurchaseMulti,
} from '@/features/materials/hooks/useMaterials'
import {
  useTools,
  useToolCategories,
  useCreateToolPurchase,
} from '@/features/toolroom/hooks/useToolroom'
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
  const [payee, setPayee] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // Distinct payees within this category (for the filter dropdown).
  const payees = useMemo(() => {
    const set = new Set<string>()
    for (const e of summary.entries) if (e.payee) set.add(e.payee)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [summary.entries])

  // Entries after the payee + date-range filters.
  const filtered = useMemo(
    () =>
      summary.entries.filter((e) => {
        if (payee === '__none__') {
          if (e.payee) return false
        } else if (payee && e.payee !== payee) return false
        if (!inRange(e.date, from, to)) return false
        return true
      }),
    [summary.entries, payee, from, to],
  )

  // KPIs recomputed from the filtered set — the total updates dynamically as the
  // payee / date filters change.
  const stats = useMemo(() => {
    const monthPrefix = todayISO().slice(0, 7)
    let total = 0
    let thisMonth = 0
    for (const e of filtered) {
      total += e.amount
      if (e.date.slice(0, 7) === monthPrefix) thisMonth += e.amount
    }
    return { total, thisMonth, count: filtered.length }
  }, [filtered])

  const pg = usePagination(filtered)

  const filtersActive = Boolean(payee || from || to)
  function clearFilters() {
    setPayee('')
    setFrom('')
    setTo('')
  }

  function exportCategory() {
    downloadXlsx(
      `expenses-${summary.category}`,
      filtered,
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
      label: filtersActive ? 'Total (filtered)' : 'Total',
      value: currency(stats.total),
      cls: 'text-slate-900',
      chip: 'border-slate-200 bg-slate-50',
    },
    {
      label: 'Entries',
      value: String(stats.count),
      cls: 'text-slate-700',
      chip: 'border-slate-200 bg-slate-50',
    },
    {
      label: 'This month',
      value: currency(stats.thisMonth),
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

      <FilterBar>
        <div>
          <label className="label">Payee</label>
          <Select
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            className="min-w-[12rem]"
          >
            <option value="">All payees</option>
            {payees.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="__none__">(No payee)</option>
          </Select>
        </div>
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {filtersActive && (
          <button className="btn-ghost btn-sm mb-0.5" onClick={clearFilters}>
            Clear
          </button>
        )}
      </FilterBar>

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
        {filtered.length === 0 ? (
          <EmptyState icon={<Receipt size={40} />} title="No entries match the filters" />
        ) : (
          <>
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
                        <button
                          className="btn-ghost btn-sm text-red-500"
                          onClick={() => onDelete(e)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
            <Pagination pg={pg} />
          </>
        )}
      </Card>
    </div>
  )
}

type PurchaseMode = 'material' | 'tool' | 'expense'
interface MatLine {
  materialId: string
  quantity: string
  totalCost: string
  totalGst: string
}
interface ToolLine {
  toolId: string
  qty: string
  unitCost: string
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
  // Tool Room master (for Tool Purchase mode).
  const toolsCrud = useTools()
  const toolList = (toolsCrud.list.data ?? []).filter((t) => (t.status ?? 'active') !== 'inactive')
  const toolCategories = useToolCategories().list.data ?? []
  const createMaterial = useCreateMaterial()
  const createTool = toolsCrud.create
  const expenseNoPreview = usePreviewNo('expense')
  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const createPurchaseMulti = useCreateOwnPurchaseMulti()
  const createToolPurchase = useCreateToolPurchase()
  const saving =
    createExpense.isPending ||
    updateExpense.isPending ||
    createPurchaseMulti.isPending ||
    createToolPurchase.isPending

  // New entries pick a mode; editing an existing row stays an expense edit.
  const [mode, setMode] = useState<PurchaseMode>(expense ? 'expense' : 'material')

  // Shared header + Other-Expense fields.
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
  // Line-item grids (new material / tool purchases).
  const [matLines, setMatLines] = useState<MatLine[]>([
    { materialId: '', quantity: '', totalCost: '', totalGst: '' },
  ])
  const [toolLines, setToolLines] = useState<ToolLine[]>([{ toolId: '', qty: '', unitCost: '' }])
  // Inline quick-add panels (null = closed).
  const [newMat, setNewMat] = useState<{ name: string; unit: string } | null>(null)
  const [newTool, setNewTool] = useState<{ name: string; categoryId: string; uom: string } | null>(
    null,
  )

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }
  const matTotal = matLines.reduce(
    (s, l) => s + (Number(l.totalCost) || 0) + (Number(l.totalGst) || 0),
    0,
  )
  const toolTotal = toolLines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0),
    0,
  )

  function setMatLine(i: number, patch: Partial<MatLine>) {
    setMatLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function setToolLine(i: number, patch: Partial<ToolLine>) {
    setToolLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function saveNewMaterial() {
    if (!newMat?.name.trim()) return toast.error('Enter a material name')
    try {
      const m = await createMaterial.mutateAsync({
        name: newMat.name.trim(),
        unit: newMat.unit.trim() || 'Nos',
        active: true,
      })
      // Drop it into the first empty line, else append a new one.
      setMatLines((ls) => {
        const idx = ls.findIndex((l) => !l.materialId)
        if (idx >= 0) return ls.map((l, i) => (i === idx ? { ...l, materialId: m.id } : l))
        return [...ls, { materialId: m.id, quantity: '', totalCost: '', totalGst: '' }]
      })
      setNewMat(null)
      toast.success('Material added')
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not add material'))
    }
  }

  async function saveNewTool() {
    if (!newTool?.name.trim()) return toast.error('Enter a tool name')
    try {
      const t = await createTool.mutateAsync({
        name: newTool.name.trim(),
        categoryId: newTool.categoryId || undefined,
        uom: newTool.uom.trim() || 'nos',
      })
      setToolLines((ls) => {
        const idx = ls.findIndex((l) => !l.toolId)
        if (idx >= 0) return ls.map((l, i) => (i === idx ? { ...l, toolId: t.id } : l))
        return [...ls, { toolId: t.id, qty: '', unitCost: '' }]
      })
      setNewTool(null)
      toast.success('Tool added')
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not add tool'))
    }
  }

  async function submit() {
    try {
      if (!expense && mode === 'material') {
        if (!form.date) return toast.error('Select a purchase date')
        const lines = matLines
          .filter((l) => l.materialId && Number(l.quantity) > 0)
          .map((l) => ({
            materialId: l.materialId,
            quantity: Number(l.quantity),
            unit: materials.find((m) => m.id === l.materialId)?.unit ?? 'Nos',
            totalCost: Number(l.totalCost) || 0,
            totalGst: Number(l.totalGst) || 0,
          }))
        if (lines.length === 0) return toast.error('Add at least one material with a quantity')
        await createPurchaseMulti.mutateAsync({
          supplier: form.vendor || undefined,
          purchaseDate: form.date,
          method: form.method,
          notes: form.notes || undefined,
          lines,
        })
        toast.success(
          `Purchased ${lines.length} material${lines.length > 1 ? 's' : ''} — added to own stock`,
        )
        onClose()
        return
      }

      if (!expense && mode === 'tool') {
        if (!form.date) return toast.error('Select a purchase date')
        const lines = toolLines
          .filter((l) => l.toolId && Number(l.qty) > 0)
          .map((l) => ({
            toolId: l.toolId,
            qty: Number(l.qty),
            unit: toolList.find((t) => t.id === l.toolId)?.uom ?? 'nos',
            unitCost: Number(l.unitCost) || 0,
          }))
        if (lines.length === 0) return toast.error('Add at least one tool with a quantity')
        await createToolPurchase.mutateAsync({
          supplier: form.vendor || undefined,
          purchaseDate: form.date,
          method: form.method,
          notes: form.notes || undefined,
          lines,
        })
        toast.success(
          `Purchased ${lines.length} tool${lines.length > 1 ? 's' : ''} — added to tool stock`,
        )
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

  const submitLabel = saving
    ? 'Saving…'
    : expense
      ? 'Save changes'
      : mode === 'material'
        ? 'Record purchase'
        : mode === 'tool'
          ? 'Record tool purchase'
          : 'Record expense'

  // Shared header (Purchase Date / Supplier / Payment Method) for both grids.
  const purchaseHeader = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="Purchase Date" required>
        <DateInput value={form.date} onChange={(v) => set('date', v)} />
      </Field>
      <Field label="Supplier / Vendor" hint={vendors.length ? 'Pick from the vendor master' : ''}>
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
    </div>
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={expense ? `Edit ${expense.expenseNo}` : 'Add Purchase / Expense'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {submitLabel}
          </button>
        </>
      }
    >
      {expense && (
        <p className="mb-3 text-right text-2xs text-slate-500">
          Last updated {fmtDateTime(expense.updatedAt)}
        </p>
      )}

      {/* Mode toggle (new entries only). Material vs Tool purchases are separate. */}
      {!expense && (
        <div className="mb-3">
          <div className="inline-flex rounded-lg bg-slate-200/60 p-1">
            {(
              [
                { k: 'material', label: 'Material Purchase' },
                { k: 'tool', label: 'Tool Purchase' },
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
            {mode === 'material'
              ? 'Buy one or more raw materials in a single record — each line is added to Own stock (Materials & Stock → Own); the whole purchase is logged as one expense.'
              : mode === 'tool'
                ? 'Buy one or more tools (inserts, drills, taps…) in a single record — each line is added to Tool Room stock; the whole purchase is logged as one expense.'
                : `Expense number will be ${expenseNoPreview}`}
          </p>
        </div>
      )}

      {/* ---------- MATERIAL PURCHASE (multi-line grid) ---------- */}
      {!expense && mode === 'material' && (
        <div className="space-y-3">
          {purchaseHeader}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-2xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 w-24 text-right">Qty</th>
                  <th className="px-3 py-2 w-28 text-right">Cost (₹)</th>
                  <th className="px-3 py-2 w-28 text-right">GST (₹)</th>
                  <th className="px-3 py-2 w-24 text-right">Line total</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matLines.map((l, i) => {
                  const lineTotal = (Number(l.totalCost) || 0) + (Number(l.totalGst) || 0)
                  return (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <Select
                          value={l.materialId}
                          onChange={(e) => setMatLine(i, { materialId: e.target.value })}
                        >
                          <option value="">Select material…</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.unit})
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="0.001"
                          min={0}
                          className="text-right"
                          value={l.quantity}
                          onChange={(e) => setMatLine(i, { quantity: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          className="text-right"
                          value={l.totalCost}
                          onChange={(e) => setMatLine(i, { totalCost: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          className="text-right"
                          value={l.totalGst}
                          onChange={(e) => setMatLine(i, { totalGst: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-700">
                        {currency(lineTotal)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          className="btn-ghost btn-sm text-red-500"
                          disabled={matLines.length === 1}
                          onClick={() => setMatLines((ls) => ls.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                setMatLines((ls) => [
                  ...ls,
                  { materialId: '', quantity: '', totalCost: '', totalGst: '' },
                ])
              }
            >
              <Plus size={15} /> Add material
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setNewMat({ name: '', unit: 'Nos' })}
            >
              <Plus size={15} /> New material item
            </button>
          </div>

          {newMat && (
            <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
              <p className="mb-2 text-xs font-semibold text-brand-700">New material item</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,8rem,auto]">
                <Input
                  placeholder="Material name"
                  value={newMat.name}
                  onChange={(e) => setNewMat({ ...newMat, name: e.target.value })}
                />
                <Input
                  placeholder="Unit (Nos, Kg…)"
                  value={newMat.unit}
                  onChange={(e) => setNewMat({ ...newMat, unit: e.target.value })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={saveNewMaterial}
                    disabled={createMaterial.isPending}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setNewMat(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">Purchase total (cost + GST)</span>
            <span className="font-semibold text-slate-900">{currency(matTotal)}</span>
          </div>
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      )}

      {/* ---------- TOOL PURCHASE (multi-line grid) ---------- */}
      {!expense && mode === 'tool' && (
        <div className="space-y-3">
          {purchaseHeader}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-2xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Tool</th>
                  <th className="px-3 py-2 w-24 text-right">Qty</th>
                  <th className="px-3 py-2 w-32 text-right">Unit cost (₹)</th>
                  <th className="px-3 py-2 w-24 text-right">Line total</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {toolLines.map((l, i) => {
                  const lineTotal = (Number(l.qty) || 0) * (Number(l.unitCost) || 0)
                  return (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <Select
                          value={l.toolId}
                          onChange={(e) => setToolLine(i, { toolId: e.target.value })}
                        >
                          <option value="">Select tool…</option>
                          {toolList.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                              {t.size ? ` — ${t.size}` : ''} ({t.uom ?? 'nos'})
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="1"
                          min={0}
                          className="text-right"
                          value={l.qty}
                          onChange={(e) => setToolLine(i, { qty: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          className="text-right"
                          value={l.unitCost}
                          onChange={(e) => setToolLine(i, { unitCost: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-700">
                        {currency(lineTotal)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          className="btn-ghost btn-sm text-red-500"
                          disabled={toolLines.length === 1}
                          onClick={() => setToolLines((ls) => ls.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setToolLines((ls) => [...ls, { toolId: '', qty: '', unitCost: '' }])}
            >
              <Plus size={15} /> Add tool
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() =>
                setNewTool({
                  name: '',
                  categoryId: toolCategories.find((c) => c.code === 'CUT')?.id ?? '',
                  uom: 'nos',
                })
              }
            >
              <Plus size={15} /> New tool item
            </button>
          </div>

          {newTool && (
            <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
              <p className="mb-2 text-xs font-semibold text-brand-700">
                New tool item (e.g. insert, drill, tap)
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,10rem,7rem,auto]">
                <Input
                  placeholder="Tool name"
                  value={newTool.name}
                  onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                />
                <Select
                  value={newTool.categoryId}
                  onChange={(e) => setNewTool({ ...newTool, categoryId: e.target.value })}
                >
                  <option value="">Category…</option>
                  {toolCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="UOM"
                  value={newTool.uom}
                  onChange={(e) => setNewTool({ ...newTool, uom: e.target.value })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={saveNewTool}
                    disabled={createTool.isPending}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setNewTool(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">Purchase total (qty × unit cost)</span>
            <span className="font-semibold text-slate-900">{currency(toolTotal)}</span>
          </div>
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      )}

      {/* ---------- OTHER EXPENSE (or editing) ---------- */}
      {(expense || mode === 'expense') && (
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
