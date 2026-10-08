'use client'

import { useMemo, useState } from 'react'
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Copy,
  Trash2,
  FileText,
  Calculator,
  Check,
  X,
} from 'lucide-react'
import type { Estimation, EstimationStatus } from '@/types'
import {
  useEstimations,
  useEstimationOperations,
  useSetEstimationStatus,
  useDeleteEstimation,
} from './hooks/useEstimations'
import { EstimationForm } from './EstimationForm'
import { QuotationForm } from '@/features/quotation/QuotationForm'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { usePermissions, Can } from '@/features/hrm/permissions'
import { computeEstimation } from '@/data/computations'
import { toUserMessage } from '@/lib/api/errors'
import { currency, qty as fmtQty, fmtDate } from '@/lib/format'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Card, Badge, Input, Select } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const STATUSES: EstimationStatus[] = [
  'Draft',
  'Under Review',
  'Approved',
  'Rejected',
  'Converted to Quotation',
]

function statusTone(s: string): 'slate' | 'blue' | 'green' | 'red' | 'violet' {
  if (s === 'Approved') return 'green'
  if (s === 'Under Review') return 'blue'
  if (s === 'Rejected') return 'red'
  if (s === 'Converted to Quotation') return 'violet'
  return 'slate'
}

export function EstimationsPage() {
  const { data: estimations = [], isLoading, isError, error } = useEstimations()
  const { data: companies = [] } = useCompanies()
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '—'
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | EstimationStatus>('')
  const [editing, setEditing] = useState<Estimation | null | undefined>(undefined)
  const [viewing, setViewing] = useState<Estimation | null>(null)
  const [quotingFrom, setQuotingFrom] = useState<Estimation | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return estimations
      .filter((e) => (status ? e.status === status : true))
      .filter((e) =>
        needle
          ? `${e.estimationNo} ${e.partName} ${e.customerPartNumber ?? ''} ${companyName(e.companyId)}`
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .sort((a, b) => (a.estimationNo < b.estimationNo ? 1 : -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimations, q, status, companies])
  const pg = usePagination(filtered)

  const columns: DataTableColumn<Estimation>[] = [
    {
      key: 'no',
      header: 'Estimation #',
      render: (e) => <span className="font-medium text-slate-800">{e.estimationNo}</span>,
    },
    { key: 'date', header: 'Date', hideBelow: 'md', render: (e) => fmtDate(e.estimationDate) },
    { key: 'customer', header: 'Customer', render: (e) => companyName(e.companyId) },
    {
      key: 'cpn',
      header: 'Cust. Part #',
      hideBelow: 'lg',
      render: (e) => e.customerPartNumber || '—',
    },
    { key: 'part', header: 'Part', render: (e) => e.partName },
    {
      key: 'qty',
      header: 'Qty',
      cellClassName: 'text-right tabular-nums',
      render: (e) => fmtQty(e.quantity),
    },
    {
      key: 'cost',
      header: 'Cost/pc',
      hideBelow: 'md',
      cellClassName: 'text-right tabular-nums',
      render: (e) => currency(e.totalCostPc),
    },
    {
      key: 'sp',
      header: 'Sell/pc',
      cellClassName: 'text-right tabular-nums',
      render: (e) => currency(e.sellingPricePc),
    },
    {
      key: 'margin',
      header: 'Margin',
      hideBelow: 'lg',
      cellClassName: 'text-right tabular-nums',
      render: (e) => `${fmtQty(e.marginPctEffective)}%`,
    },
    {
      key: 'total',
      header: 'Total Value',
      hideBelow: 'lg',
      cellClassName: 'text-right tabular-nums',
      render: (e) => currency(e.totalSelling),
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => <Badge tone={statusTone(e.status)}>{e.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      cellClassName: 'text-right whitespace-nowrap',
      render: (e) => (
        <div className="flex justify-end gap-0.5">
          <button className="btn-ghost btn-sm" title="View" onClick={() => setViewing(e)}>
            <Eye size={15} />
          </button>
          {['Draft', 'Under Review', 'Rejected'].includes(e.status) && (
            <Can perm="ESTIMATION_CREATE">
              <button className="btn-ghost btn-sm" title="Edit" onClick={() => setEditing(e)}>
                <Pencil size={15} />
              </button>
            </Can>
          )}
        </div>
      ),
    },
  ]

  if (isError)
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{toUserMessage(error)}</p>
      </div>
    )

  return (
    <div>
      <PageHeader
        title="Estimations"
        subtitle="Cost a part from raw material, machining and overheads — then quote it."
        actions={
          <Can perm="ESTIMATION_CREATE">
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> New Estimation
            </button>
          </Can>
        }
      />

      <Card className="mb-3 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search estimation, customer, part…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as EstimationStatus | '')}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(e) => e.id}
          loading={isLoading}
          onRowClick={(e) => setViewing(e)}
          empty={{
            icon: <Calculator size={40} />,
            title: 'No estimations yet',
            description: 'Create your first cost estimation to get started.',
          }}
          mobileCard
        />
        <Pagination pg={pg} />
      </Card>

      {editing !== undefined && (
        <EstimationFormLoader estimation={editing} onClose={() => setEditing(undefined)} />
      )}
      {viewing && (
        <EstimationDetail
          estimation={viewing}
          companyName={companyName(viewing.companyId)}
          onClose={() => setViewing(null)}
          onEdit={(e) => {
            setViewing(null)
            setEditing(e)
          }}
          onQuote={(e) => {
            setViewing(null)
            setQuotingFrom(e)
          }}
        />
      )}
      {quotingFrom && (
        <QuotationForm
          quotation={null}
          fromEstimation={quotingFrom}
          onClose={() => setQuotingFrom(null)}
        />
      )}
    </div>
  )
}

// When editing, operations must be loaded first; this loader fetches them then
// renders the form (new estimations skip the fetch).
function EstimationFormLoader({
  estimation,
  onClose,
}: {
  estimation: Estimation | null
  onClose: () => void
}) {
  const { data: ops, isLoading } = useEstimationOperations(estimation?.id ?? '')
  if (estimation?.id && isLoading) {
    return (
      <Modal open onClose={onClose} size="sm" title="Loading…">
        <p className="text-sm text-slate-500">Loading estimation…</p>
      </Modal>
    )
  }
  return <EstimationForm estimation={estimation} operations={ops} onClose={onClose} />
}

function EstimationDetail({
  estimation,
  companyName,
  onClose,
  onEdit,
  onQuote,
}: {
  estimation: Estimation
  companyName: string
  onClose: () => void
  onEdit: (e: Estimation) => void
  onQuote: (e: Estimation) => void
}) {
  const perms = usePermissions()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: ops = [] } = useEstimationOperations(estimation.id)
  const setStatus = useSetEstimationStatus()
  const del = useDeleteEstimation()
  const c = computeEstimation(estimation, ops)

  async function move(status: EstimationStatus) {
    try {
      await setStatus.mutateAsync({ id: estimation.id, status })
      toast.success(`Estimation ${status}`)
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Status change failed'))
    }
  }

  async function remove() {
    if (
      !(await confirm({
        title: 'Delete estimation',
        message: `Delete ${estimation.estimationNo}? This cannot be undone.`,
        danger: true,
        confirmLabel: 'Delete',
      }))
    )
      return
    try {
      await del.mutateAsync(estimation.id)
      toast.success('Estimation deleted')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  const canApprove = perms.can('ESTIMATION_APPROVE')
  const canCreate = perms.can('ESTIMATION_CREATE')
  const canQuote = perms.can('QUOTATION_CREATE')

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${estimation.estimationNo} — ${estimation.partName}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {estimation.status === 'Draft' && canCreate && (
              <button className="btn-secondary btn-sm" onClick={() => move('Under Review')}>
                Submit for Review
              </button>
            )}
            {estimation.status === 'Under Review' && canApprove && (
              <>
                <button className="btn-primary btn-sm" onClick={() => move('Approved')}>
                  <Check size={14} /> Approve
                </button>
                <button className="btn-danger btn-sm" onClick={() => move('Rejected')}>
                  <X size={14} /> Reject
                </button>
              </>
            )}
            {['Draft', 'Under Review', 'Rejected'].includes(estimation.status) && canCreate && (
              <button className="btn-ghost btn-sm text-red-500" onClick={remove}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {['Draft', 'Under Review', 'Rejected'].includes(estimation.status) && canCreate && (
              <button className="btn-secondary btn-sm" onClick={() => onEdit(estimation)}>
                <Pencil size={14} /> Edit
              </button>
            )}
            <button
              className="btn-secondary btn-sm"
              onClick={() =>
                onEdit({ ...estimation, id: '', estimationNo: '', status: 'Draft' } as Estimation)
              }
            >
              <Copy size={14} /> Duplicate
            </button>
            {estimation.status === 'Approved' && canQuote && (
              <button className="btn-primary btn-sm" onClick={() => onQuote(estimation)}>
                <FileText size={14} /> Generate Quotation
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <Badge tone={statusTone(estimation.status)}>{estimation.status}</Badge>
        <span className="text-sm text-slate-500">{companyName}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <D label="Customer Part #" value={estimation.customerPartNumber || '—'} />
        <D
          label="Drawing"
          value={
            [estimation.drawingNumber, estimation.drawingRevision].filter(Boolean).join(' Rev ') ||
            '—'
          }
        />
        <D
          label="Material"
          value={
            [estimation.materialGrade, estimation.rawMaterialForm].filter(Boolean).join(' · ') ||
            '—'
          }
        />
        <D label="Quantity" value={fmtQty(estimation.quantity)} />
        <D label="Weight/pc" value={`${fmtQty(c.materialWeightKg)} kg`} />
        <D
          label="Expected Delivery"
          value={estimation.expectedDeliveryDate ? fmtDate(estimation.expectedDeliveryDate) : '—'}
        />
      </dl>

      <div className="mt-4 rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Cost Breakdown (per piece)
        </div>
        <div className="divide-y divide-slate-100 text-sm">
          <CostRow label="Raw Material" value={c.materialCostPc} />
          <CostRow label="Machining" value={c.machiningCostPc} />
          <CostRow
            label="Other (tooling/inspection/overhead/labour/packing/transport)"
            value={c.otherCostPc}
          />
          <CostRow label="Rejection Allowance" value={c.rejectionCostPc} />
          <CostRow label="Total Cost / pc" value={c.totalCostPc} strong />
          <CostRow
            label={`Selling Price / pc (${estimation.pricingMethod} ${estimation.pricingMethod === 'markup' ? estimation.markupPercent : estimation.marginPercent}%)`}
            value={c.sellingPricePc}
            strong
            tone="brand"
          />
          <CostRow label="Profit / pc" value={c.profitPc} tone="green" />
          <CostRow
            label={`Total Selling Value (×${fmtQty(estimation.quantity)})`}
            value={c.totalSelling}
            strong
            tone="brand"
          />
        </div>
      </div>

      {ops.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Operations
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase text-slate-400">
                <th className="py-1 pr-3">#</th>
                <th className="py-1 pr-3">Operation</th>
                <th className="py-1 pr-3">Machine</th>
                <th className="py-1 pr-3 text-right">Setup</th>
                <th className="py-1 pr-3 text-right">Cycle</th>
                <th className="py-1 pr-3 text-right">₹/hr</th>
              </tr>
            </thead>
            <tbody>
              {ops.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-500">{o.seq}</td>
                  <td className="py-1 pr-3 font-medium text-slate-800">{o.operationName}</td>
                  <td className="py-1 pr-3 text-slate-600">{o.machineType || '—'}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(o.setupTimeMin)}m</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(o.cycleTimeMin)}m</td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {fmtQty(o.machineHourRate + o.operatorCostHour)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {estimation.manufacturingNotes && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-2xs uppercase tracking-wide text-slate-400">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {estimation.manufacturingNotes}
          </p>
        </div>
      )}
    </Modal>
  )
}

function D({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs text-slate-400">{label}</div>
      <div className="font-medium text-slate-800">{value}</div>
    </div>
  )
}

function CostRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: number
  strong?: boolean
  tone?: 'brand' | 'green'
}) {
  const color =
    tone === 'brand' ? 'text-brand-700' : tone === 'green' ? 'text-emerald-700' : 'text-slate-800'
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className={strong ? 'font-semibold text-slate-700' : 'text-slate-600'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold' : ''} ${color}`}>
        {currency(value)}
      </span>
    </div>
  )
}
