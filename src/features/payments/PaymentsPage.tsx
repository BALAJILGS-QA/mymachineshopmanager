import { useMemo, useState } from 'react'
import { Building2, Coins, Download, IndianRupee, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import type { Payment } from '@/types'
import { usePayments, useDeletePayment } from './hooks/usePayments'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { toUserMessage } from '@/lib/api/errors'
import { currency, fmtDate, inRange, monthEndISO, monthStartISO } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { CompanyFilter, DateRangeFilter, FilterBar, SearchBox } from '@/components/common/Filters'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName } from '@/features/shared/lookups'
import { PaymentForm } from './PaymentForm'

export function PaymentsPage() {
  const { data: payments = [], isLoading } = usePayments()
  const { data: invoices = [] } = useInvoices()
  const deletePayment = useDeletePayment()
  const companyName = useCompanyName()
  const toast = useToast()
  const confirm = useConfirm()

  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState(monthStartISO())
  const [to, setTo] = useState(monthEndISO())

  const invoiceNo = (id?: string) => invoices.find((i) => i.id === id)?.invoiceNo ?? '—'

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

  // Summary tiles over the filtered rows.
  const stats = useMemo(() => {
    let total = 0
    let advance = 0
    const companies = new Set<string>()
    for (const p of rows) {
      total += p.amount
      if (p.isAdvance) advance += p.amount
      companies.add(p.companyId)
    }
    return { count: rows.length, total, advance, companies: companies.size }
  }, [rows])

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

  return (
    <div>
      <PageHeader
        title="Payments"
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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Wallet size={18} />} label="Payments" value={stats.count} tone="brand" />
        <StatTile
          icon={<IndianRupee size={18} />}
          label="Total received"
          value={currency(stats.total)}
          tone="green"
        />
        <StatTile
          icon={<Building2 size={18} />}
          label="Companies"
          value={stats.companies}
          tone="blue"
        />
        <StatTile
          icon={<Coins size={18} />}
          label="Advances"
          value={currency(stats.advance)}
          tone="violet"
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
          <div className="p-8 text-center text-sm text-slate-500">Loading payments…</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Wallet size={40} />} title="No payments recorded" />
        ) : (
          <ResponsiveTable>
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
                  <td className="td font-mono text-xs">
                    {p.isAdvance ? <Badge tone="violet">Advance</Badge> : invoiceNo(p.invoiceId)}
                  </td>
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
        )}
        <Pagination pg={pg} />
      </Card>

      {show && <PaymentForm onClose={() => setShow(false)} />}
      {editing && <PaymentForm payment={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
