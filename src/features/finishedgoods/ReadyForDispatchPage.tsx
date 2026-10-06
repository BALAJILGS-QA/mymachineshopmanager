'use client'

import { useMemo, useState } from 'react'
import { Truck } from 'lucide-react'
import type { FinishedGoodsBalance, JobOrder } from '@/types'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanyName } from '@/features/shared/lookups'
import { useFgBalances, useDispatchFg } from './hooks/useFinishedGoods'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { JobStatusBadge } from '@/components/common/status'
import { Field, Input } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAppNavigate } from '@/components/nav/app-link'
import { toUserMessage } from '@/lib/api/errors'
import { qty } from '@/lib/format'

export function ReadyForDispatchPage() {
  const { data: jobs = [], isLoading, isError, error } = useJobs()
  const { data: balances = [] } = useFgBalances()
  const companyName = useCompanyName()
  const perms = usePermissions()
  const dispatch = useDispatchFg()
  const toast = useToast()
  const nav = useAppNavigate()

  const balById = useMemo(() => {
    const m = new Map<string, FinishedGoodsBalance>()
    for (const b of balances) m.set(b.jobId, b)
    return m
  }, [balances])

  const rows = useMemo(
    () =>
      jobs.filter(
        (j) => j.status === 'Ready for Dispatch' || (balById.get(j.id)?.balance ?? 0) > 0,
      ),
    [jobs, balById],
  )

  const [modal, setModal] = useState<JobOrder | null>(null)
  const [qtyVal, setQtyVal] = useState('')
  const [note, setNote] = useState('')

  function balance(j: JobOrder): number {
    return balById.get(j.id)?.balance ?? 0
  }

  async function submit() {
    if (!modal) return
    const n = Number(qtyVal)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a valid quantity.')
      return
    }
    try {
      await dispatch.mutateAsync({ jobId: modal.id, qty: n, note: note || undefined })
      toast.success('Finished goods dispatched (drawn down from FG balance)')
      setModal(null)
      setQtyVal('')
      setNote('')
    } catch (ex) {
      toast.error(toUserMessage(ex))
    }
  }

  const canDispatch = perms.can('DISPATCH_EXECUTE')

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
      key: 'ordered',
      header: 'Ordered',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'md',
      render: (j) => qty(j.orderedQty),
    },
    {
      key: 'accepted',
      header: 'Accepted',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'md',
      render: (j) => qty(j.acceptedQty ?? 0),
    },
    {
      key: 'balance',
      header: 'FG Available',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums font-semibold',
      render: (j) => qty(balance(j)),
    },
    { key: 'status', header: 'Status', render: (j) => <JobStatusBadge status={j.status} /> },
    {
      key: 'action',
      header: '',
      hideOnCard: true,
      render: (j) =>
        canDispatch && balance(j) > 0 ? (
          <div className="flex justify-end gap-1">
            <button
              className="btn-secondary btn-sm"
              onClick={() => {
                setModal(j)
                setQtyVal(String(balance(j)))
              }}
            >
              Dispatch
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => nav('/app/deliveries')}
              title="Create delivery challan"
            >
              Challan
            </button>
          </div>
        ) : null,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Ready for Dispatch"
        subtitle="QC-approved finished goods available for dispatch (finalized via delivery challan)"
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(j) => j.id}
        loading={isLoading}
        empty={{
          icon: <Truck className="h-6 w-6" />,
          title: isError ? 'Could not load dispatch queue' : 'Nothing ready for dispatch',
          description: isError
            ? toUserMessage(error)
            : 'Jobs appear here once accepted stock is in Finished Goods.',
        }}
      />

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={`Dispatch · ${modal?.jobNo ?? ''}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submit} disabled={dispatch.isPending}>
              {dispatch.isPending ? 'Saving…' : 'Record dispatch'}
            </button>
          </>
        }
      >
        {modal && (
          <>
            <p className="mb-2 text-sm text-slate-600">
              FG available {qty(balance(modal))}. Dispatch cannot exceed the finished-goods balance.
              Finalize the physical dispatch via the existing Delivery Challan module.
            </p>
            <Field label="Quantity to dispatch" required>
              <Input
                type="number"
                min={0}
                value={qtyVal}
                onChange={(e) => setQtyVal(e.target.value)}
              />
            </Field>
            <Field label="Note" className="mt-3">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Challan ref, vehicle, etc."
              />
            </Field>
          </>
        )}
      </Modal>
    </div>
  )
}
