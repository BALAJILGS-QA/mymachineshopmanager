import { useMemo, useState } from 'react'
import { Coins, Download, FileText, IndianRupee, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import type { Invoice, Payment } from '@/types'
import { usePayments, useDeletePayment } from './hooks/usePayments'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { toUserMessage } from '@/lib/api/errors'
import { computeInvoice, receivablesSummary } from '@/data/computations'
import { currency, fmtDate, inRange } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { TableSkeleton } from '@/components/common/Skeleton'
import { StatTile } from '@/components/common/StatTile'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { CompanyFilter, DateRangeFilter, FilterBar, SearchBox } from '@/components/common/Filters'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { AppLink } from '@/components/nav/app-link'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName } from '@/features/shared/lookups'
import { PaymentForm } from './PaymentForm'

// Payment-status badge tone for an invoice-linked receipt, from its outstanding.
function statusTone(inv: Invoice, payments: Payment[]): { tone: string; label: string } {
  if (inv.status === 'Cancelled') return { tone: 'red', label: 'Cancelled' }
  const { total, paid, outstanding } = computeInvoice(inv, payments)
  if (paid <= 0) return { tone: 'slate', label: 'Unpaid' }
  if (outstanding > 0.005 && paid < total) return { tone: 'amber', label: 'Partially Paid' }
  return { tone: 'green', label: 'Paid' }
}

export function PaymentsPage() {
  const { data: payments = [], isLoading } = usePayments()
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices()
  const deletePayment = useDeletePayment()
  const companyName = useCompanyName()
  const toast = useToast()
  const confirm = useConfirm()

  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const invoiceById = useMemo(() => {
    const m = new Map<string, Invoice>()
    for (const inv of invoices) m.set(inv.id, inv)
    return m
  }, [invoices])
  const invoiceNo = (id?: string) => (id ? (invoiceById.get(id)?.invoiceNo ?? '—') : '—')

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return payments
      .filter((p) => {
        if (company && p.companyId !== company) return false
        if (!inRange(p.date, from, to)) return false
        if (
          s &&
          !`${p.paymentNo} ${p.reference ?? ''} ${invoiceNo(p.invoiceId)}`.toLowerCase().includes(s)
        )
          return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, company, from, to, search])

  const pg = usePagination(rows)

  // Accounting-safe receivables roll-up. Reacts to the Company + Date filters
  // (not the free-text Search, which only narrows the table). Invoiced &
  // outstanding filter by invoice date; received & advances by payment date —
  // see `receivablesSummary`. All figures derive from the DB records via the
  // shared calculation core, so there is no duplicated financial logic.
  const summary = useMemo(
    () =>
      receivablesSummary(invoices, payments, {
        companyId: company || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    [invoices, payments, company, from, to],
  )
  const summaryLoading = isLoading || invoicesLoading
  const money = (v: number) => (summaryLoading ? '—' : currency(v))

  async function del(id: string) {
    const ok = await confirm({
      message: 'Delete this payment? Invoice outstanding will be recalculated.',
      danger: true,
    })
    if (!ok) return
    try {
      await deletePayment.mutateAsync(id)
      toast.success('Payment deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  function exportExcel() {
    downloadXlsx(
      'payments',
      rows,
      [
        { header: 'Payment', value: (p) => p.paymentNo },
        { header: 'Date', value: (p) => p.date },
        { header: 'Company', value: (p) => companyName(p.companyId) },
        { header: 'Invoice', value: (p) => invoiceNo(p.invoiceId) },
        { header: 'Amount', value: (p) => p.amount },
        { header: 'Method', value: (p) => p.method },
        { header: 'Reference', value: (p) => p.reference ?? '' },
        { header: 'Advance', value: (p) => (p.isAdvance ? 'Yes' : 'No') },
      ],
      'Payments',
    )
  }

  // Invoice column: a clickable invoice number + its payment status for
  // allocated receipts, or a clear badge for advance / unallocated money — never
  // a bare "—" when the allocation is actually meaningful.
  function renderInvoiceCell(p: Payment) {
    if (p.isAdvance) return <Badge tone="violet">Advance</Badge>
    if (!p.invoiceId) return <Badge tone="slate">Unallocated</Badge>
    const inv = invoiceById.get(p.invoiceId)
    if (!inv) return <span className="text-slate-400">—</span>
    const st = statusTone(inv, payments)
    return (
      <span className="inline-flex items-center gap-1.5">
        <AppLink
          to={`/app/invoices/${inv.id}/print`}
          className="font-medium text-brand-600 hover:underline"
          title={`Open ${inv.invoiceNo}`}
        >
          {inv.invoiceNo}
        </AppLink>
        <Badge tone={st.tone}>{st.label}</Badge>
      </span>
    )
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Customer receipts and advances against invoices"
        actions={
          <>
            <button className="btn-secondary" onClick={exportExcel}>
              <Download size={16} /> Excel
            </button>
            <button className="btn-primary" onClick={() => setShow(true)}>
              <Plus size={16} /> Record Payment
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<FileText size={18} />}
          label="Total Invoiced"
          value={money(summary.totalInvoiced)}
          tone="blue"
          hint="Customer invoices issued"
        />
        <StatTile
          icon={<IndianRupee size={18} />}
          label="Total Received"
          value={money(summary.totalReceived)}
          tone="green"
          hint="Payments received"
        />
        <StatTile
          icon={<Wallet size={18} />}
          label="Outstanding Receivable"
          value={money(summary.totalOutstanding)}
          tone="amber"
          hint="Amount yet to be collected"
        />
        <StatTile
          icon={<Coins size={18} />}
          label="Advances Received"
          value={money(summary.totalAdvances)}
          tone="purple"
          hint="Unallocated customer advances"
        />
      </div>

      <FilterBar>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search payment, invoice, ref…"
        />
        <CompanyFilter value={company} onChange={setCompany} />
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      <Card>
        {isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Wallet size={40} />} title="No payments recorded" />
        ) : (
          <>
            <div className="hidden md:block">
              <ResponsiveTable className="min-w-[56rem]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="th">Payment</th>
                    <th className="th">Date</th>
                    <th className="th">Company</th>
                    <th className="th">Invoice</th>
                    <th className="th text-right">Amount</th>
                    <th className="th">Method</th>
                    <th className="th">Reference</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pg.pageItems.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="td font-mono text-xs text-slate-500">{p.paymentNo}</td>
                      <td className="td">{fmtDate(p.date)}</td>
                      <td className="td">{companyName(p.companyId)}</td>
                      <td className="td font-mono text-xs">{renderInvoiceCell(p)}</td>
                      <td className="td text-right font-semibold text-emerald-600">
                        {currency(p.amount)}
                      </td>
                      <td className="td">{p.method}</td>
                      <td className="td">{p.reference || '—'}</td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn-ghost btn-sm"
                            title="Edit"
                            onClick={() => setEditing(p)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="btn-ghost btn-sm text-red-500"
                            title="Delete"
                            onClick={() => del(p.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>

            {/* Mobile: condensed list-row table (tap a row to edit) */}
            <table className="w-full table-fixed border-collapse md:hidden">
              <tbody className="divide-y divide-slate-100">
                {pg.pageItems.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer align-top transition-colors active:bg-slate-50"
                    onClick={() => setEditing(p)}
                  >
                    <td className="px-3 py-2.5">
                      <p className="truncate font-semibold text-slate-800">
                        {companyName(p.companyId)}
                      </p>
                      <p className="truncate font-mono text-2xs text-slate-400">
                        {p.paymentNo} · {fmtDate(p.date)}
                      </p>
                    </td>
                    <td className="w-32 px-2 py-2.5 text-right">
                      <p className="truncate font-semibold text-emerald-600">
                        {currency(p.amount)}
                      </p>
                      <p className="truncate text-2xs text-slate-400">{p.method}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <Pagination pg={pg} />
      </Card>

      {show && <PaymentForm onClose={() => setShow(false)} />}
      {editing && <PaymentForm payment={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
