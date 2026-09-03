import { useMemo } from 'react'
import { FileCheck, QrCode } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate } from '@/lib/format'
import { computeInvoice } from '@/data/computations'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useFinanceAccess } from '../access'
import { useEInvoices, useEInvoiceActions, useGstRegistrations } from '../hooks/useFinance'
import type { EInvoiceRecord } from '../types'
import type { Invoice } from '@/types'

const STATUS_TONE: Record<string, string> = {
  generated: 'green',
  pending: 'amber',
  submitted: 'blue',
  failed: 'red',
  cancelled: 'slate',
  not_applicable: 'slate',
}

export function EInvoicePage() {
  const invoices = useInvoices().data ?? []
  const companies = useCompanies().data ?? []
  const records = useEInvoices().data ?? []
  const regs = useGstRegistrations().list.data ?? []
  const defaultReg = regs.find((r) => r.isDefault) ?? regs[0]
  const { generate, cancel } = useEInvoiceActions()
  const perms = useFinanceAccess()
  const canManage = perms.can('EINVOICE_MANAGE')
  const toast = useToast()
  const confirm = useConfirm()

  const recByInvoice = useMemo(() => {
    const m = new Map<string, EInvoiceRecord>()
    for (const r of records) if (r.invoiceId && r.status !== 'cancelled') m.set(r.invoiceId, r)
    return m
  }, [records])

  const company = (id: string) => companies.find((c) => c.id === id)
  const rows = [...invoices]
    .filter((i) => i.status !== 'Draft')
    .sort((a, b) => (b.date > a.date ? 1 : -1))
  const pg = usePagination(rows)

  async function onGenerate(inv: Invoice) {
    const c = computeInvoice(inv, [])
    try {
      await generate.mutateAsync({
        invoiceId: inv.id,
        companyId: inv.companyId,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.date,
        supplierGstin: defaultReg?.gstin,
        recipientGstin: company(inv.companyId)?.gstin,
        totalValue: c.total,
      })
      toast.success('IRN generated')
    } catch (e) {
      toast.error(toUserMessage(e, 'E-invoice generation failed'))
    }
  }

  async function onCancel(rec: EInvoiceRecord) {
    const ok = await confirm({
      title: 'Cancel e-invoice',
      message: `Cancel IRN for this invoice?`,
      danger: true,
      confirmLabel: 'Cancel IRN',
    })
    if (!ok) return
    try {
      await cancel.mutateAsync({ rec, reason: 'Cancelled by user' })
      toast.success('IRN cancelled')
    } catch (e) {
      toast.error(toUserMessage(e, 'Cancel failed'))
    }
  }

  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'no',
      header: 'Invoice',
      cellClassName: 'font-mono text-xs',
      render: (i) => i.invoiceNo,
    },
    { key: 'date', header: 'Date', cellClassName: 'tnum text-xs', render: (i) => fmtDate(i.date) },
    {
      key: 'cust',
      header: 'Customer',
      cellClassName: 'font-semibold',
      render: (i) => company(i.companyId)?.name ?? '—',
    },
    {
      key: 'status',
      header: 'E-Invoice',
      render: (i) => {
        const r = recByInvoice.get(i.id)
        return r ? (
          <Badge tone={STATUS_TONE[r.status] ?? 'slate'}>{r.status}</Badge>
        ) : (
          <Badge tone="slate">not generated</Badge>
        )
      },
    },
    {
      key: 'irn',
      header: 'IRN',
      cellClassName: 'font-mono text-2xs',
      render: (i) => {
        const r = recByInvoice.get(i.id)
        return r?.irn ? `${r.irn.slice(0, 12)}…` : '—'
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (i) => {
        const r = recByInvoice.get(i.id)
        return (
          <div className="flex justify-end gap-1">
            {canManage && !r && (
              <button
                className="btn-ghost btn-sm text-emerald-600"
                onClick={() => onGenerate(i)}
                disabled={generate.isPending}
              >
                <QrCode size={15} /> Generate
              </button>
            )}
            {canManage && r && r.status === 'generated' && (
              <button className="btn-ghost btn-sm text-red-500" onClick={() => onCancel(r)}>
                Cancel
              </button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="E-Invoice (IRN)"
        subtitle={`Generate & manage IRNs. Active provider: ${defaultReg ? 'server-configured' : 'sandbox'} — real IRP/GSP plugs in server-side.`}
      />
      {!defaultReg && (
        <Card className="mb-3 border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          No default GST registration set — the supplier GSTIN will be blank. Add one under Tax
          Configuration.
        </Card>
      )}
      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(i) => i.id}
          minWidthClassName="min-w-[52rem]"
          empty={{
            icon: <FileCheck size={40} />,
            title: 'No invoices',
            description: 'Posted invoices appear here for e-invoicing.',
          }}
        />
        <Pagination pg={pg} />
      </Card>
    </div>
  )
}
