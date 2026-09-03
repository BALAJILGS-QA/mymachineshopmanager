import { useMemo, useState } from 'react'
import { Truck } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card, Field, Input, Select } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate } from '@/lib/format'
import { computeInvoice } from '@/data/computations'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useFinanceAccess } from '../access'
import { useEwayActions, useEwayBills, useGstRegistrations } from '../hooks/useFinance'
import type { EwayBill } from '../types'
import type { Invoice } from '@/types'

const STATUS_TONE: Record<string, string> = {
  generated: 'green',
  draft: 'slate',
  cancelled: 'slate',
  rejected: 'red',
  expired: 'amber',
}

export function EWayBillPage() {
  const invoices = useInvoices().data ?? []
  const companies = useCompanies().data ?? []
  const bills = useEwayBills().data ?? []
  const regs = useGstRegistrations().list.data ?? []
  const defaultReg = regs.find((r) => r.isDefault) ?? regs[0]
  const { generate, cancel } = useEwayActions()
  const perms = useFinanceAccess()
  const canManage = perms.can('EWAYBILL_MANAGE')
  const toast = useToast()
  const confirm = useConfirm()

  const [modalInv, setModalInv] = useState<Invoice | null>(null)
  const [form, setForm] = useState({ transportMode: 'road', vehicleNumber: '', distanceKm: '' })

  const billByInvoice = useMemo(() => {
    const m = new Map<string, EwayBill>()
    for (const b of bills) if (b.invoiceId && b.status !== 'cancelled') m.set(b.invoiceId, b)
    return m
  }, [bills])

  const company = (id: string) => companies.find((c) => c.id === id)
  const rows = [...invoices]
    .filter((i) => i.status !== 'Draft')
    .sort((a, b) => (b.date > a.date ? 1 : -1))
  const pg = usePagination(rows)

  async function submitGenerate() {
    if (!modalInv) return
    const c = computeInvoice(modalInv, [])
    try {
      await generate.mutateAsync({
        invoiceId: modalInv.id,
        companyId: modalInv.companyId,
        documentNo: modalInv.invoiceNo,
        documentDate: modalInv.date,
        supplierGstin: defaultReg?.gstin,
        recipientGstin: company(modalInv.companyId)?.gstin,
        transportMode: form.transportMode,
        vehicleNumber: form.vehicleNumber || undefined,
        invoiceValue: c.total,
        distanceKm: form.distanceKm ? Number(form.distanceKm) : undefined,
      })
      toast.success('E-way bill generated')
      setModalInv(null)
      setForm({ transportMode: 'road', vehicleNumber: '', distanceKm: '' })
    } catch (e) {
      toast.error(toUserMessage(e, 'E-way generation failed'))
    }
  }

  async function onCancel(b: EwayBill) {
    const ok = await confirm({
      title: 'Cancel e-way bill',
      message: `Cancel EWB ${b.ewbNumber}?`,
      danger: true,
      confirmLabel: 'Cancel EWB',
    })
    if (!ok) return
    try {
      await cancel.mutateAsync({ rec: b, reason: 'Cancelled by user' })
      toast.success('E-way bill cancelled')
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
      key: 'ewb',
      header: 'EWB No.',
      cellClassName: 'font-mono text-xs',
      render: (i) => billByInvoice.get(i.id)?.ewbNumber ?? '—',
    },
    {
      key: 'valid',
      header: 'Valid Until',
      cellClassName: 'text-xs',
      render: (i) => {
        const b = billByInvoice.get(i.id)
        return b?.validUntil ? fmtDate(b.validUntil) : '—'
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => {
        const b = billByInvoice.get(i.id)
        return b ? (
          <Badge tone={STATUS_TONE[b.status] ?? 'slate'}>{b.status}</Badge>
        ) : (
          <Badge tone="slate">not generated</Badge>
        )
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (i) => {
        const b = billByInvoice.get(i.id)
        return (
          <div className="flex justify-end gap-1">
            {canManage && !b && (
              <button className="btn-ghost btn-sm text-emerald-600" onClick={() => setModalInv(i)}>
                <Truck size={15} /> Generate
              </button>
            )}
            {canManage && b && b.status === 'generated' && (
              <button className="btn-ghost btn-sm text-red-500" onClick={() => onCancel(b)}>
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
        title="E-Way Bill"
        subtitle="Generate & manage e-way bills. Real EWB API plugs in server-side (currently sandbox)."
      />
      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(i) => i.id}
          minWidthClassName="min-w-[56rem]"
          empty={{
            icon: <Truck size={40} />,
            title: 'No invoices',
            description: 'Posted invoices appear here for e-way bills.',
          }}
        />
        <Pagination pg={pg} />
      </Card>

      <Modal
        open={!!modalInv}
        onClose={() => setModalInv(null)}
        title={`E-Way Bill · ${modalInv?.invoiceNo ?? ''}`}
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setModalInv(null)}>
              Cancel
            </button>
            <button
              className="btn-primary btn-sm"
              onClick={submitGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? 'Generating…' : 'Generate EWB'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Transport mode">
            <Select
              value={form.transportMode}
              onChange={(e) => setForm((f) => ({ ...f, transportMode: e.target.value }))}
            >
              <option value="road">Road</option>
              <option value="rail">Rail</option>
              <option value="air">Air</option>
              <option value="ship">Ship</option>
            </Select>
          </Field>
          <Field label="Vehicle number">
            <Input
              value={form.vehicleNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))
              }
              placeholder="TN01AB1234"
            />
          </Field>
          <Field label="Distance (km)">
            <Input
              type="number"
              value={form.distanceKm}
              onChange={(e) => setForm((f) => ({ ...f, distanceKm: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
