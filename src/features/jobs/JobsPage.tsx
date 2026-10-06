import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { ClipboardList, Download, Eye, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { JobOrder, JobStatus } from '@/types'
import { useJobs, useDeleteJob } from './hooks/useJobs'
import { toUserMessage } from '@/lib/api/errors'
import { JOB_STATUSES as STATUS_OPTIONS, JOB_PRIORITIES } from '@/constants/domain'
import { jobPendingQty } from '@/data/computations'
import { fmtDate, inRange, qty } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { TableSkeleton } from '@/components/common/Skeleton'
import { Card, EmptyState, Select } from '@/components/ui/primitives'
import { CompanyFilter, FilterBar, SearchBox, DateRangeFilter } from '@/components/common/Filters'
import { JobStatusBadge, PriorityBadge } from '@/components/common/status'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName } from '@/features/shared/lookups'
import { useAppNavigate } from '@/components/nav/app-link'
import { JobForm } from './JobForm'

// ---- Production Order Workbench --------------------------------------------
// The Production Order (internally `job_orders`) is the central manufacturing
// object. This workbench answers, at a glance: how many orders are open, due,
// overdue, in production, waiting for QC, in rework, or ready to dispatch — and
// lets planners filter down to exactly those.

const today = () => new Date().toISOString().slice(0, 10)
const CLOSED: JobStatus[] = ['Completed', 'Delivered', 'Cancelled']

// KPI quick-filters. Each is a predicate over a Production Order; clicking a KPI
// tile applies it (and clears the explicit Status dropdown, which it supersedes).
type Quick =
  '' | 'open' | 'dueToday' | 'overdue' | 'inProduction' | 'qcPending' | 'rework' | 'readyDispatch'

const QUICK_PREDICATE: Record<Exclude<Quick, ''>, (j: JobOrder, t: string) => boolean> = {
  open: (j) => !['Delivered', 'Cancelled'].includes(j.status),
  dueToday: (j, t) => j.dueDate === t && !CLOSED.includes(j.status),
  overdue: (j, t) => !!j.dueDate && j.dueDate < t && !CLOSED.includes(j.status),
  inProduction: (j) => j.status === 'In Progress',
  qcPending: (j) => ['Completed', 'Quality Control'].includes(j.status),
  rework: (j) => j.status === 'Rework',
  readyDispatch: (j) => j.status === 'Ready for Dispatch',
}

const QUICK_LABEL: Record<Exclude<Quick, ''>, string> = {
  open: 'Open Production Orders',
  dueToday: 'Due Today',
  overdue: 'Overdue',
  inProduction: 'In Production',
  qcPending: 'QC Pending',
  rework: 'Rework',
  readyDispatch: 'Ready for Dispatch',
}

// Tone per KPI (status-coherent with the badge palette; never colour-only — each
// tile carries its own text label too).
type Tone = 'slate' | 'blue' | 'amber' | 'red' | 'violet' | 'green'
const KPI_ORDER: { key: Exclude<Quick, ''>; tone: Tone }[] = [
  { key: 'open', tone: 'slate' },
  { key: 'dueToday', tone: 'blue' },
  { key: 'overdue', tone: 'red' },
  { key: 'inProduction', tone: 'blue' },
  { key: 'qcPending', tone: 'amber' },
  { key: 'rework', tone: 'violet' },
  { key: 'readyDispatch', tone: 'green' },
]

const TONE_CLASS: Record<Tone, { bar: string; value: string; ring: string }> = {
  slate: { bar: 'bg-slate-400', value: 'text-slate-900', ring: 'ring-slate-300' },
  blue: { bar: 'bg-blue-500', value: 'text-blue-700', ring: 'ring-blue-300' },
  amber: { bar: 'bg-amber-500', value: 'text-amber-700', ring: 'ring-amber-300' },
  red: { bar: 'bg-red-500', value: 'text-red-700', ring: 'ring-red-300' },
  violet: { bar: 'bg-violet-500', value: 'text-violet-700', ring: 'ring-violet-300' },
  green: { bar: 'bg-emerald-500', value: 'text-emerald-700', ring: 'ring-emerald-300' },
}

function KpiTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  tone: Tone
  active: boolean
  onClick: () => void
}) {
  const c = TONE_CLASS[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'relative flex min-w-[8.5rem] flex-1 items-center gap-3 overflow-hidden rounded-xl border bg-white px-3.5 py-2.5 text-left transition',
        'hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:ring-2',
        c.ring,
        active ? 'border-slate-400 ring-2' : 'border-slate-200',
      )}
    >
      <span className={clsx('absolute inset-y-0 left-0 w-1', c.bar)} aria-hidden />
      <div className="min-w-0">
        <div className={clsx('text-xl font-bold leading-none', c.value)}>{value}</div>
        <div className="mt-1 truncate text-2xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </div>
      </div>
    </button>
  )
}

// Debounce the search box so we don't re-filter the whole list on every keystroke.
function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 pr-1 text-xs font-medium text-slate-700">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove filter ${label}`}
        className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
      >
        <X size={12} />
      </button>
    </span>
  )
}

export function JobsPage() {
  const { data: jobs = [], isLoading } = useJobs()
  const deleteJob = useDeleteJob()
  const companyName = useCompanyName()
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useAppNavigate()

  // Open the Production Order in its dedicated object page (never a modal).
  const open = (j: JobOrder) => nav(`/app/jobs/${j.id}`)

  const [editing, setEditing] = useState<JobOrder | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [quick, setQuick] = useState<Quick>('')

  const debouncedSearch = useDebouncedValue(search)
  const t = today()

  // Base set: everything EXCEPT the KPI quick-filter. KPI counts are computed on
  // this set so they stay meaningful as company/search/date/status change, and
  // the active KPI then narrows the visible rows.
  const base = useMemo(() => {
    const s = debouncedSearch.trim().toLowerCase()
    return jobs
      .filter((j) => {
        if (company && j.companyId !== company) return false
        if (status && j.status !== status) return false
        if (priority && j.priority !== priority) return false
        if (!inRange(j.orderDate, from, to)) return false
        if (s) {
          const hay =
            `${j.jobNo} ${j.partName} ${j.partNumber ?? ''} ${j.customerPo ?? ''} ${companyName(j.companyId)} ${j.operator ?? ''}`.toLowerCase()
          if (!hay.includes(s)) return false
        }
        return true
      })
      .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))
  }, [jobs, company, status, priority, from, to, debouncedSearch, companyName])

  const kpiCounts = useMemo(() => {
    const acc = {} as Record<Exclude<Quick, ''>, number>
    for (const { key } of KPI_ORDER)
      acc[key] = base.filter((j) => QUICK_PREDICATE[key](j, t)).length
    return acc
  }, [base, t])

  const filtered = useMemo(
    () => (quick ? base.filter((j) => QUICK_PREDICATE[quick](j, t)) : base),
    [base, quick, t],
  )

  const pg = usePagination(filtered)

  const hasFilters = !!(search || company || status || priority || from || to || quick)
  function clearAll() {
    setSearch('')
    setCompany('')
    setStatus('')
    setPriority('')
    setFrom('')
    setTo('')
    setQuick('')
  }
  // Status dropdown and KPI quick-filter are mutually exclusive (a KPI is a
  // higher-level view); selecting one clears the other.
  function pickStatus(v: string) {
    setStatus(v)
    if (v) setQuick('')
  }
  function pickQuick(key: Exclude<Quick, ''>) {
    setQuick((q) => (q === key ? '' : key))
    setStatus('')
  }

  async function onDelete(j: JobOrder) {
    const ok = await confirm({
      title: 'Delete production order',
      message: `Delete ${j.jobNo}? Cancelled orders are usually kept for history.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteJob.mutateAsync(j.id)
      toast.success('Production order deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  function exportExcel() {
    downloadXlsx(
      'production-orders',
      filtered,
      [
        { header: 'Production Order No', value: (j) => j.jobNo },
        { header: 'Customer', value: (j) => companyName(j.companyId) },
        { header: 'Part', value: (j) => j.partName },
        { header: 'Part No', value: (j) => j.partNumber ?? '' },
        { header: 'Order Qty', value: (j) => j.orderedQty },
        { header: 'Planned Qty', value: (j) => j.plannedQty ?? j.orderedQty },
        { header: 'Produced Qty', value: (j) => j.completedQty },
        { header: 'Accepted Qty', value: (j) => j.acceptedQty ?? 0 },
        { header: 'Rejected Qty', value: (j) => j.rejectedQty ?? 0 },
        { header: 'Rework Qty', value: (j) => j.reworkQty ?? 0 },
        { header: 'Remaining Qty', value: (j) => jobPendingQty(j.orderedQty, j.completedQty) },
        { header: 'Priority', value: (j) => j.priority },
        { header: 'Status', value: (j) => j.status },
        { header: 'Order Date', value: (j) => j.orderDate },
        { header: 'Due Date', value: (j) => j.dueDate ?? '' },
      ],
      'Production Orders',
    )
  }

  return (
    <div>
      <PageHeader
        title="Production Orders"
        subtitle="Plan, execute, monitor and track manufacturing orders from planning through dispatch."
        actions={
          <>
            <button className="btn-secondary" onClick={exportExcel}>
              <Download size={16} /> Excel
            </button>
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> Create Production Order
            </button>
          </>
        }
      />

      {/* KPIs — clickable; each narrows the list to that exception/stage. */}
      <div className="mb-4 flex flex-wrap gap-2.5">
        {KPI_ORDER.map(({ key, tone }) => (
          <KpiTile
            key={key}
            label={QUICK_LABEL[key]}
            value={kpiCounts[key]}
            tone={tone}
            active={quick === key}
            onClick={() => pickQuick(key)}
          />
        ))}
      </div>

      <FilterBar>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search order, customer, part, part no, PO, operator…"
        />
        <CompanyFilter value={company} onChange={setCompany} />
        <div>
          <label className="label">Status</label>
          <Select
            value={status}
            onChange={(e) => pickStatus(e.target.value)}
            className="min-w-[8rem]"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="label">Priority</label>
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="min-w-[7rem]"
          >
            <option value="">All priorities</option>
            {JOB_PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </div>
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      {/* Active filter chips + Clear All */}
      {hasFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {quick && <Chip label={QUICK_LABEL[quick]} onClear={() => setQuick('')} />}
          {search && <Chip label={`“${search}”`} onClear={() => setSearch('')} />}
          {company && (
            <Chip label={`Customer: ${companyName(company)}`} onClear={() => setCompany('')} />
          )}
          {status && <Chip label={`Status: ${status}`} onClear={() => setStatus('')} />}
          {priority && <Chip label={`Priority: ${priority}`} onClear={() => setPriority('')} />}
          {(from || to) && (
            <Chip
              label={`Date: ${from || '…'} → ${to || '…'}`}
              onClear={() => {
                setFrom('')
                setTo('')
              }}
            />
          )}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      <Card>
        {isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={40} />}
            title={hasFilters ? 'No matching production orders' : 'No production orders'}
            description={
              hasFilters
                ? 'Try adjusting or clearing the filters above.'
                : 'Create a production order to begin tracking manufacturing.'
            }
            action={
              !hasFilters ? (
                <button className="btn-primary" onClick={() => setEditing(null)}>
                  <Plus size={16} /> Create Production Order
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <ResponsiveTable className="min-w-[82rem]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="th">PO No.</th>
                    <th className="th">Customer</th>
                    <th className="th">Part</th>
                    <th className="th text-right" title="Order Quantity">
                      Order
                    </th>
                    <th className="th text-right" title="Planned Quantity">
                      Plan
                    </th>
                    <th className="th text-right" title="Produced Quantity">
                      Prod
                    </th>
                    <th className="th hidden text-right lg:table-cell" title="Accepted Quantity">
                      Acc
                    </th>
                    <th className="th hidden text-right lg:table-cell" title="Rejected Quantity">
                      Rej
                    </th>
                    <th className="th hidden text-right lg:table-cell" title="Rework Quantity">
                      Rwk
                    </th>
                    <th className="th text-right" title="Remaining Quantity">
                      Bal
                    </th>
                    <th className="th">Priority</th>
                    <th className="th">Status</th>
                    <th className="th">Due</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pg.pageItems.map((j) => {
                    const overdue = j.dueDate && j.dueDate < t && !CLOSED.includes(j.status)
                    return (
                      <tr key={j.id} className="hover:bg-slate-50/60">
                        <td
                          className="td cursor-pointer font-mono text-xs font-semibold text-brand-700 hover:underline"
                          onClick={() => open(j)}
                        >
                          {j.jobNo}
                        </td>
                        <td className="td">{companyName(j.companyId)}</td>
                        <td className="td">
                          <div className="font-medium text-slate-800">{j.partName}</div>
                          {j.partNumber && (
                            <div className="text-2xs text-slate-500">{j.partNumber}</div>
                          )}
                        </td>
                        <td className="td text-right">{qty(j.orderedQty)}</td>
                        <td className="td text-right">{qty(j.plannedQty ?? j.orderedQty)}</td>
                        <td className="td text-right">{qty(j.completedQty)}</td>
                        <td className="td hidden text-right text-emerald-700 lg:table-cell">
                          {qty(j.acceptedQty ?? 0)}
                        </td>
                        <td className="td hidden text-right text-red-600 lg:table-cell">
                          {qty(j.rejectedQty ?? 0)}
                        </td>
                        <td className="td hidden text-right text-violet-700 lg:table-cell">
                          {qty(j.reworkQty ?? 0)}
                        </td>
                        <td className="td text-right font-semibold">
                          {qty(jobPendingQty(j.orderedQty, j.completedQty))}
                        </td>
                        <td className="td">
                          <PriorityBadge priority={j.priority} />
                        </td>
                        <td className="td">
                          <JobStatusBadge status={j.status} />
                        </td>
                        <td className={`td ${overdue ? 'font-semibold text-red-600' : ''}`}>
                          {fmtDate(j.dueDate)}
                          {overdue && <span className="ml-1 text-2xs">(overdue)</span>}
                        </td>
                        <td className="td">
                          <div className="flex justify-end gap-1">
                            <button
                              className="btn-ghost btn-sm"
                              title="View production order"
                              onClick={() => open(j)}
                            >
                              <Eye size={15} />
                            </button>
                            <button className="btn-ghost btn-sm" onClick={() => setEditing(j)}>
                              <Pencil size={15} />
                            </button>
                            <button
                              className="btn-ghost btn-sm text-red-500"
                              onClick={() => onDelete(j)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </ResponsiveTable>
            </div>

            {/* Mobile: condensed list-row table (tap a row to edit the order) */}
            <table className="w-full table-fixed border-collapse md:hidden">
              <tbody className="divide-y divide-slate-100">
                {pg.pageItems.map((j) => {
                  const overdue = j.dueDate && j.dueDate < t && !CLOSED.includes(j.status)
                  return (
                    <tr
                      key={j.id}
                      className="cursor-pointer align-top transition-colors active:bg-slate-50"
                      onClick={() => open(j)}
                    >
                      <td className="px-3 py-2.5">
                        <p className="truncate font-semibold text-slate-800">{j.partName}</p>
                        <p className="truncate font-mono text-2xs text-slate-400">
                          {j.jobNo} · {companyName(j.companyId)}
                        </p>
                        <p
                          className={clsx(
                            'truncate text-2xs',
                            overdue ? 'font-semibold text-red-600' : 'text-slate-400',
                          )}
                        >
                          Due {fmtDate(j.dueDate)}
                          {overdue && ' (overdue)'}
                        </p>
                      </td>
                      <td className="w-24 px-3 py-2.5">
                        <div className="flex flex-col items-end gap-1">
                          <JobStatusBadge status={j.status} />
                          <span className="truncate text-2xs text-slate-500">
                            {qty(jobPendingQty(j.orderedQty, j.completedQty))} rem
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
        <Pagination pg={pg} />
      </Card>

      {editing !== undefined && <JobForm job={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}
