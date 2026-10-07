'use client'

import { useMemo, useState } from 'react'
import { PackageCheck, Truck } from 'lucide-react'
import type { FinishedGoodsBalance, JobOrder } from '@/types'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanyName } from '@/features/shared/lookups'
import { useFgBalances, useDispatchFg } from './hooks/useFinishedGoods'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { JobStatusBadge } from '@/components/common/status'
import { SearchBox } from '@/components/common/Filters'
import { Field, Input } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAppNavigate, AppLink } from '@/components/nav/app-link'
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
  const [search, setSearch] = useState('')

  const balById = useMemo(() => {
    const m = new Map<string, FinishedGoodsBalance>()
    for (const b of balances) m.set(b.jobId, b)
    return m
  }, [balances])

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return jobs
      .filter((j) => j.status === 'Ready for Dispatch' || (balById.get(j.id)?.balance ?? 0) > 0)
      .filter(
        (j) =>
          !s ||
          j.jobNo.toLowerCase().includes(s) ||
          j.partName.toLowerCase().includes(s) ||
          companyName(j.companyId).toLowerCase().includes(s),
      )
  }, [jobs, balById, search, companyName])

  const kpis = useMemo(() => {
    const readyJobs = jobs.filter(
      (j) => j.status === 'Ready for Dispatch' || (balById.get(j.id)?.balance ?? 0) > 0,
    ).length
    const available = balances.reduce((sum, b) => sum + (b.balance ?? 0), 0)
    return { readyJobs, available }
  }, [jobs, balById, balances])

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
      render: (j) => (
        <AppLink to={`/app/jobs/${j.id}`} className="text-brand-600 hover:underline">
          {j.jobNo}
        </AppLink>
      ),
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
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile
          icon={<Truck size={18} />}
          tone="orange"
          label="Jobs ready to dispatch"
          value={kpis.readyJobs}
        />
        <StatTile
          icon={<PackageCheck size={18} />}
          tone="green"
          label="FG available to dispatch"
          value={qty(kpis.available)}
          hint="across all ready jobs"
        />
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Dispatch draws down the finished-goods balance; finalize the physical shipment with a
        delivery challan.
      </p>
      <div className="mb-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search job, item, company…" />
      </div>
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
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={qtyVal}
                  onChange={(e) => setQtyVal(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost btn-sm shrink-0"
                  onClick={() => setQtyVal(String(balance(modal)))}
                >
                  Max
                </button>
              </div>
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
