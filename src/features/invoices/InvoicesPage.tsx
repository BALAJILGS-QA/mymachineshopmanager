import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Ban,
  Download,
  FileDown,
  FileText,
  Pencil,
  Plus,
  Printer,
  Wallet,
} from 'lucide-react'
import { downloadInvoicePdf } from './invoicePdf'
import type { Invoice, InvoiceStatus } from '@/types'
import { invoiceRepo, BusinessRuleError } from '@/data/repo'
import { useDb } from '@/data/store'
import { computeInvoice } from '@/data/computations'
import { currency, fmtDate } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Card, EmptyState, Select } from '@/components/ui/primitives'
import { CompanyFilter, FilterBar, SearchBox } from '@/components/common/Filters'
import { InvoiceStatusBadge } from '@/components/common/status'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName } from '@/features/shared/lookups'
import { InvoiceForm } from './InvoiceForm'
import { PaymentForm } from '@/features/payments/PaymentForm'

const STATUSES: InvoiceStatus[] = ['Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled']

export function InvoicesPage() {
  const invoices = useDb((db) => db.invoices)
  const payments = useDb((db) => db.payments)
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [editing, setEditing] = useState<Invoice | null | undefined>(undefined)
  const [payFor, setPayFor] = useState<Invoice | null>(null)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState('')

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return invoices
      .filter((inv) => {
        if (company && inv.companyId !== company) return false
        if (status && inv.status !== status) return false
        if (s && !`${inv.invoiceNo} ${inv.reference ?? ''}`.toLowerCase().includes(s)) return false
        return true
      })
      .map((inv) => ({ inv, c: computeInvoice(inv, payments) }))
      .sort((a, b) => (a.inv.date < b.inv.date ? 1 : -1))
  }, [invoices, payments, company, status, search])

  async function cancel(inv: Invoice) {
    const ok = await confirm({
      title: 'Cancel invoice',
      message: `Cancel ${inv.invoiceNo}? It will be excluded from outstanding totals but kept in history.`,
      danger: true,
      confirmLabel: 'Cancel invoice',
    })
    if (!ok) return
    try {
      invoiceRepo.setStatus(inv.id, 'Cancelled')
      toast.success('Invoice cancelled')
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Failed')
    }
  }

  function exportCsv() {
    downloadCsv('invoices', rows, [
      { header: 'Invoice', value: (r) => r.inv.invoiceNo },
      { header: 'Date', value: (r) => r.inv.date },
      { header: 'Company', value: (r) => companyName(r.inv.companyId) },
      { header: 'Status', value: (r) => r.inv.status },
      { header: 'Total', value: (r) => r.c.total },
      { header: 'Paid', value: (r) => r.c.paid },
      { header: 'Outstanding', value: (r) => r.c.outstanding },
    ])
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} total`}
        actions={
          <>
            <button className="btn-secondary" onClick={exportCsv}>
              <Download size={16} /> CSV
            </button>
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> New Invoice
            </button>
          </>
        }
      />

      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search invoice or ref…" />
        <CompanyFilter value={company} onChange={setCompany} />
        <div>
          <label className="label">Status</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="min-w-[9rem]">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <Card>
        {rows.length === 0 ? (
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
              {rows.map(({ inv, c }) => (
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
      </Card>

      {editing !== undefined && (
        <InvoiceForm invoice={editing} onClose={() => setEditing(undefined)} />
      )}
      {payFor && (
        <PaymentForm invoice={payFor} onClose={() => setPayFor(null)} />
      )}
    </div>
  )
}
