import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Ban,
  Clock,
  Download,
  FileDown,
  FileText,
  IndianRupee,
  Pencil,
  Percent,
  Plus,
  Printer,
  Wallet,
} from 'lucide-react'
import { downloadInvoicePdf } from './invoicePdf'
import type { Invoice } from '@/types'
import { useInvoices, useSetInvoiceStatus } from './hooks/useInvoices'
import { usePayments } from '@/features/payments/hooks/usePayments'
import { toUserMessage } from '@/lib/api/errors'
import { computeInvoice } from '@/data/computations'
import {
  currency,
  fmtDate,
  monthEndISO,
  monthStartISO,
  thisMonthLabel,
  thisMonthPrefix,
} from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card, EmptyState, Select } from '@/components/ui/primitives'
import {
  CompanyFilter,
  DateRangeFilter,
  FilterBar,
  SearchBox,
  inRange,
} from '@/components/common/Filters'
import { InvoiceStatusBadge } from '@/components/common/status'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName } from '@/features/shared/lookups'
import { InvoiceForm } from './InvoiceForm'
import { PaymentForm } from '@/features/payments/PaymentForm'
import { INVOICE_STATUSES as STATUSES } from '@/constants/domain'

export function InvoicesPage() {
  const { data: invoices = [], isLoading } = useInvoices()
  const { data: payments = [] } = usePayments()
  const setInvoiceStatus = useSetInvoiceStatus()
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [editing, setEditing] = useState<Invoice | null | undefined>(undefined)
  const [payFor, setPayFor] = useState<Invoice | null>(null)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState(monthStartISO())
  const [to, setTo] = useState(monthEndISO())

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return invoices
      .filter((inv) => {
        if (company && inv.companyId !== company) return false
        if (status && inv.status !== status) return false
        if (!inRange(inv.date, from, to)) return false
        if (s && !`${inv.invoiceNo} ${inv.reference ?? ''}`.toLowerCase().includes(s)) return false
        return true
      })
      .map((inv) => ({ inv, c: computeInvoice(inv, payments) }))
      .sort((a, b) => (a.inv.date < b.inv.date ? 1 : -1))
  }, [invoices, payments, company, status, from, to, search])

  const pg = usePagination(rows)

  // Current-month summary tiles (excludes cancelled invoices from money totals).
  const monthPrefix = thisMonthPrefix()
  const monthStats = useMemo(() => {
    const inMonth = invoices.filter(
      (i) => i.date.slice(0, 7) === monthPrefix && i.status !== 'Cancelled',
    )
    let total = 0
    let paid = 0
    let outstanding = 0
    for (const inv of inMonth) {
      const c = computeInvoice(inv, payments)
      total += c.total
      paid += c.paid
      outstanding += c.outstanding
    }
    return { count: inMonth.length, total, paid, outstanding }
  }, [invoices, payments, monthPrefix])

  // GST summary over the filtered rows (excludes cancelled invoices).
  const gst = useMemo(() => {
    let taxable = 0
    let cgst = 0
    let sgst = 0
    for (const { inv, c } of rows) {
      if (inv.status === 'Cancelled') continue
      const t = Math.max(0, c.subtotal - (inv.discount || 0))
      taxable += t
      cgst += (t * (inv.cgstPercent || 0)) / 100
      sgst += (t * (inv.sgstPercent || 0)) / 100
    }
    return { taxable, cgst, sgst, total: cgst + sgst }
  }, [rows])

  // Company-wise summary over the filtered rows (excludes cancelled invoices).
  const byCompany = useMemo(() => {
    const map = new Map<
      string,
      { name: string; count: number; total: number; paid: number; outstanding: number }
    >()
    for (const { inv, c } of rows) {
      if (inv.status === 'Cancelled') continue
      const cur = map.get(inv.companyId) ?? {
        name: companyName(inv.companyId),
        count: 0,
        total: 0,
        paid: 0,
        outstanding: 0,
      }
      cur.count += 1
      cur.total += c.total
      cur.paid += c.paid
      cur.outstanding += c.outstanding
      map.set(inv.companyId, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [rows, companyName])

  async function cancel(inv: Invoice) {
    const ok = await confirm({
      title: 'Cancel invoice',
      message: `Cancel ${inv.invoiceNo}? It will be excluded from outstanding totals but kept in history.`,
      danger: true,
      confirmLabel: 'Cancel invoice',
    })
    if (!ok) return
    try {
      await setInvoiceStatus.mutateAsync({ id: inv.id, status: 'Cancelled' })
      toast.success('Invoice cancelled')
    } catch (e) {
      toast.error(toUserMessage(e, 'Failed'))
    }
  }

  function exportExcel() {
    downloadXlsx(
      'invoices',
      rows,
      [
        { header: 'Invoice', value: (r) => r.inv.invoiceNo, width: 18 },
        { header: 'Date', value: (r) => fmtDate(r.inv.date), width: 14 },
        { header: 'Company', value: (r) => companyName(r.inv.companyId), width: 24 },
        { header: 'Status', value: (r) => r.inv.status, width: 12 },
        { header: 'Subtotal', value: (r) => r.c.subtotal, width: 12 },
        {
          header: 'CGST',
          value: (r) => (r.c.subtotal - (r.inv.discount || 0)) * ((r.inv.cgstPercent || 0) / 100),
          width: 12,
        },
        {
          header: 'SGST',
          value: (r) => (r.c.subtotal - (r.inv.discount || 0)) * ((r.inv.sgstPercent || 0) / 100),
          width: 12,
        },
        { header: 'Total', value: (r) => r.c.total, width: 12 },
        { header: 'Paid', value: (r) => r.c.paid, width: 12 },
        { header: 'Outstanding', value: (r) => r.c.outstanding, width: 14 },
      ],
      'Invoices',
    )
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        actions={
          <>
            <button className="btn-secondary" onClick={exportExcel}>
              <Download size={16} /> Excel
            </button>
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> New Invoice
            </button>
          </>
        }
      />

      <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">
        This month — {thisMonthLabel()}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<FileText size={18} />}
          label="Invoices"
          value={monthStats.count}
          tone="brand"
        />
        <StatTile
          icon={<IndianRupee size={18} />}
          label="Invoiced value"
          value={currency(monthStats.total)}
          tone="blue"
        />
        <StatTile
          icon={<Wallet size={18} />}
          label="Received"
          value={currency(monthStats.paid)}
          tone="green"
        />
        <StatTile
          icon={<Clock size={18} />}
          label="Outstanding"
          value={currency(monthStats.outstanding)}
          tone="amber"
        />
      </div>

      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search invoice or ref…" />
        <CompanyFilter value={company} onChange={setCompany} />
        <div>
          <label className="label">Status</label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="min-w-[9rem]"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      {/* GST summary — reflects the filters above (excludes cancelled invoices). */}
      <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">
        GST Summary
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<IndianRupee size={18} />}
          label="Taxable value"
          value={currency(gst.taxable)}
          tone="slate"
        />
        <StatTile
          icon={<Percent size={18} />}
          label="CGST"
          value={currency(gst.cgst)}
          tone="violet"
        />
        <StatTile
          icon={<Percent size={18} />}
          label="SGST"
          value={currency(gst.sgst)}
          tone="violet"
        />
        <StatTile
          icon={<IndianRupee size={18} />}
          label="Total GST"
          value={currency(gst.total)}
          tone="blue"
        />
      </div>

      {/* Company-wise summary — reflects the filters above. */}
      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-slate-500">
          Company-wise summary
        </div>
        {byCompany.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            No invoices for the current filters.
          </p>
        ) : (
          <ResponsiveTable className="min-w-[40rem]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Company</th>
                <th className="th text-right">Invoices</th>
                <th className="th text-right">Total</th>
                <th className="th text-right">Paid</th>
                <th className="th text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {byCompany.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50/60">
                  <td className="td font-medium text-slate-800">{r.name}</td>
                  <td className="td text-right">{r.count}</td>
                  <td className="td text-right font-medium">{currency(r.total)}</td>
                  <td className="td text-right text-emerald-600">{currency(r.paid)}</td>
                  <td className="td text-right font-semibold text-amber-600">
                    {currency(r.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading invoices…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} />}
            title="No invoices"
            description="Create an invoice from completed jobs or manually."
          />
        ) : (
          <ResponsiveTable>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Invoice</th>
                <th className="th">Date</th>
                <th className="th">Company</th>
                <th className="th text-right">Total</th>
                <th className="th text-right">Paid</th>
                <th className="th text-right">Outstanding</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pg.pageItems.map(({ inv, c }) => (
                <tr key={inv.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono text-xs font-semibold text-slate-700">
                    {inv.invoiceNo}
                  </td>
                  <td className="td">{fmtDate(inv.date)}</td>
                  <td className="td">{companyName(inv.companyId)}</td>
                  <td className="td text-right font-medium">{currency(c.total)}</td>
                  <td className="td text-right text-emerald-600">{currency(c.paid)}</td>
                  <td className="td text-right font-semibold text-amber-600">
                    {currency(c.outstanding)}
                  </td>
                  <td className="td">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      {inv.status !== 'Cancelled' && inv.status !== 'Paid' && (
                        <button
                          className="btn-ghost btn-sm text-emerald-600"
                          title="Record payment"
                          onClick={() => setPayFor(inv)}
                        >
                          <Wallet size={15} />
                        </button>
                      )}
                      <button
                        className="btn-ghost btn-sm"
                        title="Download PDF"
                        onClick={() => downloadInvoicePdf(inv.id)}
                      >
                        <FileDown size={15} />
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        title="Print"
                        onClick={() => navigate(`/app/invoices/${inv.id}/print`)}
                      >
                        <Printer size={15} />
                      </button>
                      {inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                        <button
                          className="btn-ghost btn-sm"
                          title="Edit"
                          onClick={() => setEditing(inv)}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {inv.status !== 'Cancelled' && (
                        <button
                          className="btn-ghost btn-sm text-red-500"
                          title="Cancel invoice"
                          onClick={() => cancel(inv)}
                        >
                          <Ban size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
        <Pagination pg={pg} />
      </Card>

      {editing !== undefined && (
        <InvoiceForm invoice={editing} onClose={() => setEditing(undefined)} />
      )}
      {payFor && <PaymentForm invoice={payFor} onClose={() => setPayFor(null)} />}
    </div>
  )
}
