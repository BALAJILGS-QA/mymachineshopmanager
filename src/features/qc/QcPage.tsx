'use client'

import { useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { JobOrder, JobStatus } from '@/types'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanyName } from '@/features/shared/lookups'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { JobStatusBadge } from '@/components/common/status'
import { SearchBox } from '@/components/common/Filters'
import { useAppNavigate } from '@/components/nav/app-link'
import { toUserMessage } from '@/lib/api/errors'
import { qty } from '@/lib/format'

const QC_STATUSES: JobStatus[] = ['Completed', 'Quality Control', 'Rework']

export function QcPage() {
  const { data: jobs = [], isLoading, isError, error } = useJobs()
  const companyName = useCompanyName()
  const nav = useAppNavigate()
  const perms = usePermissions()
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return jobs
      .filter((j) => QC_STATUSES.includes(j.status))
      .filter(
        (j) =>
          !s ||
          j.jobNo.toLowerCase().includes(s) ||
          j.partName.toLowerCase().includes(s) ||
          (j.partNumber ?? '').toLowerCase().includes(s),
      )
  }, [jobs, search])

  const canInspect = perms.can('QC_INSPECT')

  const columns: DataTableColumn<JobOrder>[] = [
    {
      key: 'jobNo',
      header: 'Job Order',
      cellClassName: 'font-mono text-xs',
      render: (j) => j.jobNo,
    },
    { key: 'company', header: 'Company', render: (j) => companyName(j.companyId) },
    { key: 'part', header: 'Item', render: (j) => j.partName },
    { key: 'partNo', header: 'Part No', hideBelow: 'md', render: (j) => j.partNumber ?? '—' },
    {
      key: 'produced',
      header: 'Produced',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (j) => qty(j.completedQty ?? 0),
    },
    { key: 'status', header: 'Status', render: (j) => <JobStatusBadge status={j.status} /> },
    {
      key: 'action',
      header: '',
      hideOnCard: true,
      render: (j) => (
        <button className="btn-secondary btn-sm" onClick={() => nav(`/app/qc/${j.id}`)}>
          {j.status === 'Completed' ? 'Begin QC' : canInspect ? 'Inspect' : 'View'}
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Quality Control"
        subtitle="Production-completed jobs awaiting / under inspection"
      />
      <div className="mb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search job, item, part no…" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(j) => j.id}
        loading={isLoading}
        onRowClick={(j) => nav(`/app/qc/${j.id}`)}
        empty={{
          icon: <ClipboardCheck className="h-6 w-6" />,
          title: isError ? 'Could not load QC queue' : 'Nothing awaiting QC',
          description: isError
            ? toUserMessage(error)
            : 'Jobs appear here once production is completed.',
        }}
      />
    </div>
  )
}
