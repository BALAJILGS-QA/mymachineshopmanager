'use client'

import { useMemo, useState } from 'react'
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Copy,
  FileText,
  Printer,
  Download,
  Check,
  X,
  Send,
  Ban,
  Factory,
} from 'lucide-react'
import type { Quotation, QuotationStatus } from '@/types'
import {
  useQuotations,
  useQuotationLines,
  useQuotationHistory,
  useSetQuotationStatus,
  useConvertQuotationToJob,
  useReviseQuotation,
} from './hooks/useQuotations'
import { QuotationForm } from './QuotationForm'
import { downloadQuotationPdf } from './quotationPdf'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { usePermissions, Can } from '@/features/hrm/permissions'
import { computeQuotation, isQuotationExpired } from '@/data/computations'
import { toUserMessage } from '@/lib/api/errors'
import { currency, fmtDate, fmtDateTime, qty as fmtQty } from '@/lib/format'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Card, Badge, Input, Select } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useAppNavigate } from '@/components/nav/app-link'

const STATUSES: QuotationStatus[] = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Sent',
  'Accepted',
  'Rejected',
  'Expired',
  'Cancelled',
]

function statusTone(s: string): 'slate' | 'blue' | 'green' | 'red' | 'violet' | 'amber' | 'cyan' {
  switch (s) {
    case 'Accepted':
      return 'green'
    case 'Approved':
      return 'cyan'
    case 'Sent':
      return 'violet'
    case 'Pending Approval':
      return 'blue'
    case 'Rejected':
      return 'red'
    case 'Expired':
      return 'amber'
    case 'Cancelled':
      return 'red'
    default:
      return 'slate'
  }
}

export function QuotationsPage() {
  const { data: quotations = [], isLoading, isError, error } = useQuotations()
  const { data: companies = [] } = useCompanies()
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '—'
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | QuotationStatus>('')
  const [editing, setEditing] = useState<Quotation | null | undefined>(undefined)
  const [viewing, setViewing] = useState<Quotation | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return quotations
      .filter((e) => (status ? e.status === status : true))
      .filter((e) =>
        needle
          ? `${e.quotationNo} ${companyName(e.companyId)}`.toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => (a.quotationNo < b.quotationNo ? 1 : -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotations, q, status, companies])
  const pg = usePagination(filtered)

  const columns: DataTableColumn<Quotation>[] = [
    {
      key: 'no',
      header: 'Quotation #',
      render: (e) => (
        <span className="font-medium text-slate-800">
          {e.quotationNo}
          {e.revisionNo > 1 ? (
            <span className="ml-1 text-2xs text-slate-400">R{e.revisionNo}</span>
          ) : null}
        </span>
      ),
    },
    { key: 'date', header: 'Date', hideBelow: 'md', render: (e) => fmtDate(e.quotationDate) },
    { key: 'customer', header: 'Customer', render: (e) => companyName(e.companyId) },
    {
      key: 'valid',
      header: 'Valid Until',
      hideBelow: 'lg',
      render: (e) => (e.expiryDate ? fmtDate(e.expiryDate) : '—'),
    },
    {
      key: 'total',
      header: 'Grand Total',
      cellClassName: 'text-right tabular-nums',
      render: (e) => currency(e.grandTotal),
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
          <button className="btn-ghost btn-sm" title="View / Preview" onClick={() => setViewing(e)}>
            <Eye size={15} />
          </button>
          <button
            className="btn-ghost btn-sm"
            title="Download PDF"
            onClick={() => downloadQuotationPdf(e.id)}
          >
            <Download size={15} />
          </button>
          {['Draft', 'Pending Approval'].includes(e.status) && (
            <Can perm="QUOTATION_CREATE">
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
        title="Quotations"
        subtitle="Create, approve, send and track customer quotations — then convert accepted ones to production orders."
        actions={
          <Can perm="QUOTATION_CREATE">
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> New Quotation
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
              placeholder="Search quotation, customer…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as QuotationStatus | '')}
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
            icon: <FileText size={40} />,
            title: 'No quotations yet',
            description: 'Create a quotation or generate one from an approved estimation.',
          }}
          mobileCard
        />
        <Pagination pg={pg} />
      </Card>

      {editing !== undefined && (
        <QuotationForm quotation={editing} onClose={() => setEditing(undefined)} />
      )}
      {viewing && (
        <QuotationDetail
          quotation={viewing}
          companyName={companyName(viewing.companyId)}
          onClose={() => setViewing(null)}
          onEdit={(x) => {
            setViewing(null)
            setEditing(x)
          }}
        />
      )}
    </div>
  )
}

function QuotationDetail({
  quotation,
  companyName,
  onClose,
  onEdit,
}: {
  quotation: Quotation
  companyName: string
  onClose: () => void
  onEdit: (q: Quotation) => void
}) {
  const perms = usePermissions()
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useAppNavigate()
  const { data: lines = [] } = useQuotationLines(quotation.id)
  const { data: history = [] } = useQuotationHistory(quotation.id)
  const setStatus = useSetQuotationStatus()
  const convert = useConvertQuotationToJob()
  const revise = useReviseQuotation()
  const busy = setStatus.isPending || convert.isPending || revise.isPending
  const c = computeQuotation(quotation, lines)
  const today = new Date().toISOString().slice(0, 10)
  const expired = isQuotationExpired(quotation.expiryDate, today)

  const canCreate = perms.can('QUOTATION_CREATE')
  const canApprove = perms.can('QUOTATION_APPROVE')
  const canConvert = perms.can('QUOTATION_CONVERT')

  async function move(status: QuotationStatus, note?: string) {
    try {
      await setStatus.mutateAsync({ id: quotation.id, status, note })
      toast.success(`Quotation ${status}`)
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Status change failed'))
    }
  }

  async function doConvert() {
    if (
      !(await confirm({
        title: 'Convert to production order',
        message: `Create a production order from ${quotation.quotationNo}?`,
        confirmLabel: 'Convert',
      }))
    )
      return
    try {
      const job = await convert.mutateAsync(quotation.id)
      toast.success(`Production order ${job.jobNo} created`)
      onClose()
      nav(`/app/jobs/${job.id}`)
    } catch (e) {
      toast.error(toUserMessage(e, 'Conversion failed'))
    }
  }

  async function doRevise() {
    if (
      !(await confirm({
        title: 'Revise quotation',
        message: `Create a new revised draft from ${quotation.quotationNo}? The original is preserved.`,
        confirmLabel: 'Revise',
      }))
    )
      return
    try {
      await revise.mutateAsync({ source: quotation, lines })
      toast.success('Revision created as a new Draft')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Revision failed'))
    }
  }

  const st = quotation.status
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${quotation.quotationNo}${quotation.revisionNo > 1 ? ` (Rev ${quotation.revisionNo})` : ''}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {st === 'Draft' && canCreate && (
              <button
                className="btn-secondary btn-sm"
                onClick={() => move('Pending Approval')}
                disabled={busy}
              >
                <Send size={14} /> Submit for Approval
              </button>
            )}
            {['Draft', 'Pending Approval'].includes(st) && canApprove && (
              <button
                className="btn-primary btn-sm"
                onClick={() => move('Approved')}
                disabled={busy}
              >
                <Check size={14} /> Approve
              </button>
            )}
            {st === 'Pending Approval' && canApprove && (
              <button
                className="btn-danger btn-sm"
                onClick={() => move('Rejected')}
                disabled={busy}
              >
                <X size={14} /> Reject
              </button>
            )}
            {st === 'Approved' && canCreate && (
              <button className="btn-primary btn-sm" onClick={() => move('Sent')} disabled={busy}>
                <Send size={14} /> Mark Sent
              </button>
            )}
            {st === 'Sent' && canCreate && (
              <>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => move('Accepted')}
                  disabled={busy}
                >
                  <Check size={14} /> Record Accepted
                </button>
                <button
                  className="btn-danger btn-sm"
                  onClick={() => move('Rejected')}
                  disabled={busy}
                >
                  <X size={14} /> Record Rejected
                </button>
                {expired && (
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => move('Expired')}
                    disabled={busy}
                  >
                    Mark Expired
                  </button>
                )}
              </>
            )}
            {st === 'Accepted' && !quotation.jobOrderId && canConvert && (
              <button className="btn-primary btn-sm" onClick={doConvert} disabled={busy}>
                <Factory size={14} /> Convert to Production Order
              </button>
            )}
            {!['Accepted', 'Cancelled', 'Rejected'].includes(st) && canApprove && (
              <button
                className="btn-ghost btn-sm text-red-500"
                onClick={() => move('Cancelled')}
                disabled={busy}
              >
                <Ban size={14} /> Cancel
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {['Draft', 'Pending Approval'].includes(st) && canCreate && (
              <button className="btn-secondary btn-sm" onClick={() => onEdit(quotation)}>
                <Pencil size={14} /> Edit
              </button>
            )}
            {!['Draft', 'Cancelled'].includes(st) && canCreate && (
              <button className="btn-secondary btn-sm" onClick={doRevise} disabled={busy}>
                <Copy size={14} /> Revise
              </button>
            )}
            <button className="btn-secondary btn-sm" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
            <button
              className="btn-primary btn-sm"
              onClick={() => downloadQuotationPdf(quotation.id)}
            >
              <Download size={14} /> PDF
            </button>
          </div>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(st)}>{st}</Badge>
        {expired && st !== 'Expired' && <Badge tone="amber">Past validity</Badge>}
        {quotation.jobOrderId && <Badge tone="green">Converted to order</Badge>}
        <span className="text-sm text-slate-500">{companyName}</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <D label="Quotation Date" value={fmtDate(quotation.quotationDate)} />
        <D label="Valid Until" value={quotation.expiryDate ? fmtDate(quotation.expiryDate) : '—'} />
        <D label="Customer GSTIN" value={quotation.customerGstin || '—'} />
        <D label="Payment Terms" value={quotation.paymentTerms || '—'} />
        <D label="Delivery" value={quotation.deliveryLeadTime || '—'} />
        <D
          label="Advance"
          value={quotation.advancePercent ? `${quotation.advancePercent}%` : '—'}
        />
        <D label="From Estimation" value={quotation.estimationId ? 'Yes' : '—'} />
        <D label="Contact" value={quotation.contactPerson || '—'} />
      </dl>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase text-slate-400">
              <th className="py-1 pr-3">#</th>
              <th className="py-1 pr-3">Description</th>
              <th className="py-1 pr-3">HSN</th>
              <th className="py-1 pr-3 text-right">Qty</th>
              <th className="py-1 pr-3 text-right">Rate</th>
              <th className="py-1 pr-3 text-right">Disc%</th>
              <th className="py-1 pr-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="py-1 pr-3 text-slate-500">{l.lineNo}</td>
                <td className="py-1 pr-3 font-medium text-slate-800">
                  {[l.partNumber, l.description].filter(Boolean).join(' — ')}
                </td>
                <td className="py-1 pr-3 text-slate-600">{l.hsn || '—'}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {fmtQty(l.quantity)}
                  {l.unit ? ` ${l.unit}` : ''}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{currency(l.unitPrice)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {l.discountPercent ? `${l.discountPercent}%` : '—'}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{currency(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
        <Tot label="Subtotal" value={c.subtotal} />
        {c.discountTotal > 0 && <Tot label="Discount" value={-c.discountTotal} />}
        {quotation.packingCharge > 0 && <Tot label="Packing" value={quotation.packingCharge} />}
        {quotation.freightCharge > 0 && <Tot label="Freight" value={quotation.freightCharge} />}
        <Tot label="Taxable Value" value={c.taxableValue} />
        {c.cgstAmount > 0 && <Tot label={`CGST ${quotation.cgstPercent}%`} value={c.cgstAmount} />}
        {c.sgstAmount > 0 && <Tot label={`SGST ${quotation.sgstPercent}%`} value={c.sgstAmount} />}
        {c.igstAmount > 0 && <Tot label={`IGST ${quotation.igstPercent}%`} value={c.igstAmount} />}
        <div className="border-t border-slate-200 pt-1">
          <Tot label="Grand Total" value={c.grandTotal} strong />
        </div>
      </div>

      {quotation.termsConditions && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-2xs uppercase tracking-wide text-slate-400">Terms & Conditions</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
            {quotation.termsConditions}
          </p>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-1 text-2xs uppercase tracking-wide text-slate-400">History</p>
          <ul className="space-y-0.5 text-xs text-slate-600">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-slate-400">{fmtDateTime(h.at)}</span> —{' '}
                {h.fromStatus ? `${h.fromStatus} → ` : ''}
                <b>{h.toStatus}</b>
                {h.note ? ` · ${h.note}` : ''}
                {h.actor ? ` · ${h.actor}` : ''}
              </li>
            ))}
          </ul>
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

function Tot({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-semibold text-slate-700' : 'text-slate-500'}>{label}</span>
      <span
        className={`tabular-nums ${strong ? 'text-base font-bold text-brand-700' : 'text-slate-800'}`}
      >
        {currency(value)}
      </span>
    </div>
  )
}
