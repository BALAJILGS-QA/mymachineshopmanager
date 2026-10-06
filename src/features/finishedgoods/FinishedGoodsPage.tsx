'use client'

import { useMemo, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import type { FinishedGoodsBalance, JobOrder } from '@/types'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanyName } from '@/features/shared/lookups'
import { useFgBalances, useReceiveFg } from './hooks/useFinishedGoods'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { JobStatusBadge } from '@/components/common/status'
import { Field, Input } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { qty } from '@/lib/format'

export function FinishedGoodsPage() {
  const { data: jobs = [], isLoading, isError, error } = useJobs()
  const { data: balances = [] } = useFgBalances()
  const companyName = useCompanyName()
  const perms = usePermissions()
  const receive = useReceiveFg()
  const toast = useToast()

  const balById = useMemo(() => {
    const m = new Map<string, FinishedGoodsBalance>()
    for (const b of balances) m.set(b.jobId, b)
    return m
  }, [balances])

  const rows = useMemo(
    () =>
      jobs.filter(
        (j) =>
          (j.acceptedQty ?? 0) > 0 ||
          (balById.get(j.id)?.received ?? 0) > 0 ||
          ['QC Approved', 'Rework', 'Ready for Dispatch'].includes(j.status),
      ),
    [jobs, balById],
  )

  const [modal, setModal] = useState<JobOrder | null>(null)
  const [qtyVal, setQtyVal] = useState('')
  const [bin, setBin] = useState('')

  function receivable(j: JobOrder): number {
    return Math.max(0, (j.acceptedQty ?? 0) - (balById.get(j.id)?.received ?? 0))
  }

  async function submit() {
    if (!modal) return
    const n = Number(qtyVal)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a valid quantity.')
      return
    }
    try {
      await receive.mutateAsync({ jobId: modal.id, qty: n, binNo: bin || undefined })
      toast.success('Moved to Finished Goods')
      setModal(null)
      setQtyVal('')
      setBin('')
    } catch (ex) {
      toast.error(toUserMessage(ex))
    }
  }

  const canMove = perms.can('FG_MOVE')

  const columns: DataTableColumn<JobOrder>[] = [
    {
      key: 'jobNo',
      header: 'Job Order',
      cellClassName: 'font-mono text-xs',
      render: (j) => j.jobNo,
    },
    { key: 'company', header: 'Company', render: (j) => companyName(j.companyId) },
    { key: 'item', header: 'Item', render: (j) => j.partName },
    {
      key: 'accepted',
      header: 'Accepted',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (j) => qty(j.acceptedQty ?? 0),
    },
    {
      key: 'received',
      header: 'In FG',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'md',
      render: (j) => qty(balById.get(j.id)?.received ?? 0),
    },
    {
      key: 'balance',
      header: 'FG Balance',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums font-semibold',
      render: (j) => qty(balById.get(j.id)?.balance ?? 0),
    },
    { key: 'status', header: 'Status', render: (j) => <JobStatusBadge status={j.status} /> },
    {
      key: 'action',
      header: '',
      hideOnCard: true,
      render: (j) =>
        canMove && receivable(j) > 0 ? (
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              setModal(j)
              setQtyVal(String(receivable(j)))
            }}
          >
            Move to FG
          </button>
        ) : null,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Finished Goods"
        subtitle="QC-accepted quantities ready to be stocked and dispatched"
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(j) => j.id}
        loading={isLoading}
        empty={{
          icon: <PackageCheck className="h-6 w-6" />,
          title: isError ? 'Could not load finished goods' : 'No finished goods yet',
          description: isError ? toUserMessage(error) : 'QC-approved jobs appear here.',
        }}
      />

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={`Move to Finished Goods · ${modal?.jobNo ?? ''}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submit} disabled={receive.isPending}>
              {receive.isPending ? 'Saving…' : 'Confirm'}
            </button>
          </>
        }
      >
        {modal && (
          <>
            <p className="mb-2 text-sm text-slate-600">
              Accepted {qty(modal.acceptedQty ?? 0)} · available to move {qty(receivable(modal))}.
              Rejected quantity cannot be moved to finished goods.
            </p>
            <Field label="Quantity to move" required>
              <Input
                type="number"
                min={0}
                value={qtyVal}
                onChange={(e) => setQtyVal(e.target.value)}
              />
            </Field>
            <Field label="Bin / location" className="mt-3">
              <Input
                value={bin}
                onChange={(e) => setBin(e.target.value)}
                placeholder="e.g. FG-A01"
              />
            </Field>
          </>
        )}
      </Modal>
    </div>
  )
}
