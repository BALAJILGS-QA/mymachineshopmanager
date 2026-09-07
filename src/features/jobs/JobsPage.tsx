import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { ClipboardList, Download, Pencil, Plus, Trash2 } from 'lucide-react'
import type { JobOrder } from '@/types'
import { useJobs, useDeleteJob } from './hooks/useJobs'
import { toUserMessage } from '@/lib/api/errors'
import { JOB_STATUSES as STATUS_OPTIONS } from '@/constants/domain'
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
import { JobForm } from './JobForm'

export function JobsPage() {
  const { data: jobs = [], isLoading } = useJobs()
  const deleteJob = useDeleteJob()
  const companyName = useCompanyName()
  const toast = useToast()
  const confirm = useConfirm()

  const [editing, setEditing] = useState<JobOrder | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    return jobs
      .filter((j) => {
        if (company && j.companyId !== company) return false
        if (status && j.status !== status) return false
        if (!inRange(j.orderDate, from, to)) return false
        if (s) {
          const hay =
            `${j.jobNo} ${j.partName} ${j.partNumber ?? ''} ${j.customerPo ?? ''}`.toLowerCase()
          if (!hay.includes(s)) return false
        }
        return true
      })
      .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))
  }, [jobs, company, status, from, to, search])

  const pg = usePagination(filtered)
  const today = new Date().toISOString().slice(0, 10)

  async function onDelete(j: JobOrder) {
    const ok = await confirm({
      title: 'Delete job order',
      message: `Delete ${j.jobNo}? Cancelled jobs are usually kept for history.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteJob.mutateAsync(j.id)
      toast.success('Job deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  function exportExcel() {
    downloadXlsx(
      'job-orders',
      filtered,
      [
        { header: 'Job No', value: (j) => j.jobNo },
        { header: 'Company', value: (j) => companyName(j.companyId) },
        { header: 'Part', value: (j) => j.partName },
        { header: 'Part No', value: (j) => j.partNumber ?? '' },
        { header: 'Ordered', value: (j) => j.orderedQty },
        { header: 'Completed', value: (j) => j.completedQty },
        { header: 'Pending', value: (j) => jobPendingQty(j.orderedQty, j.completedQty) },
        { header: 'Priority', value: (j) => j.priority },
        { header: 'Status', value: (j) => j.status },
        { header: 'Order Date', value: (j) => j.orderDate },
        { header: 'Due Date', value: (j) => j.dueDate ?? '' },
      ],
      'Job Orders',
    )
  }

  return (
    <div>
      <PageHeader
        title="Job Orders"
        subtitle="Track every job from order through machining to dispatch"
        actions={
          <>
            <button className="btn-secondary" onClick={exportExcel}>
              <Download size={16} /> Excel
            </button>
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> Add Job
            </button>
          </>
        }
      />

      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search job, part, PO…" />
        <CompanyFilter value={company} onChange={setCompany} />
        <div>
          <label className="label">Status</label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="min-w-[8rem]"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      <Card>
        {isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={40} />}
            title="No job orders"
            description="Create a job order to begin tracking production."
          />
        ) : (
          <>
            <div className="hidden md:block">
              <ResponsiveTable className="min-w-[64rem]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="th">Job No</th>
                    <th className="th">Company</th>
                    <th className="th">Part</th>
                    <th className="th text-right">Ord</th>
                    <th className="th text-right">Comp</th>
                    <th className="th text-right">Pend</th>
                    <th className="th">Priority</th>
                    <th className="th">Status</th>
                    <th className="th">Due</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pg.pageItems.map((j) => {
                    const overdue =
                      j.dueDate &&
                      j.dueDate < today &&
                      !['Completed', 'Delivered', 'Cancelled'].includes(j.status)
                    return (
                      <tr key={j.id} className="hover:bg-slate-50/60">
                        <td className="td font-mono text-xs font-semibold text-slate-700">
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
                        <td className="td text-right">{qty(j.completedQty)}</td>
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

            {/* Mobile: condensed list-row table (tap a row to edit the job) */}
            <table className="w-full table-fixed border-collapse md:hidden">
              <tbody className="divide-y divide-slate-100">
                {pg.pageItems.map((j) => {
                  const overdue =
                    j.dueDate &&
                    j.dueDate < today &&
                    !['Completed', 'Delivered', 'Cancelled'].includes(j.status)
                  return (
                    <tr
                      key={j.id}
                      className="cursor-pointer align-top transition-colors active:bg-slate-50"
                      onClick={() => setEditing(j)}
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
                            {qty(jobPendingQty(j.orderedQty, j.completedQty))} pend
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
