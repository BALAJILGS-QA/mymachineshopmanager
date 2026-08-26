import { useMemo, useState } from 'react'
import { Download, Plus, Trash2, Wallet } from 'lucide-react'
import { useDb } from '@/data/store'
import { usePayments, useDeletePayment } from './hooks/usePayments'
import { toUserMessage } from '@/lib/api/errors'
import { currency, fmtDate } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import {
  CompanyFilter,
  DateRangeFilter,
  FilterBar,
  SearchBox,
  inRange,
} from '@/components/common/Filters'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName } from '@/features/shared/lookups'
import { PaymentForm } from './PaymentForm'

export function PaymentsPage() {
  const { data: payments = [], isLoading } = usePayments()
  const invoices = useDb((db) => db.invoices)
  const deletePayment = useDeletePayment()
  const companyName = useCompanyName()
  const toast = useToast()
  const confirm = useConfirm()

  const [show, setShow] = useState(false)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

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

  const total = rows.reduce((s, p) => s + p.amount, 0)
  const pg = usePagination(rows)

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

  function exportCsv() {
    downloadCsv('payments', rows, [
      { header: 'Payment', value: (p) => p.paymentNo },
      { header: 'Date', value: (p) => p.date },
      { header: 'Company', value: (p) => companyName(p.companyId) },
      { header: 'Invoice', value: (p) => invoiceNo(p.invoiceId) },
      { header: 'Amount', value: (p) => p.amount },
      { header: 'Method', value: (p) => p.method },
      { header: 'Reference', value: (p) => p.reference ?? '' },
      { header: 'Advance', value: (p) => (p.isAdvance ? 'Yes' : 'No') },
    ])
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={`${rows.length} shown · ${currency(total)}`}
        actions={
          <>
            <button className="btn-secondary" onClick={exportCsv}>
              <Download size={16} /> CSV
            </button>
            <button className="btn-primary" onClick={() => setShow(true)}>
              <Plus size={16} /> Record Payment
            </button>
          </>
        }
      />

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
                <th className="th text-right"></th>
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
                  <td className="td text-right">
                    <button className="btn-ghost btn-sm text-red-500" onClick={() => del(p.id)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
        <Pagination pg={pg} />
      </Card>

      {show && <PaymentForm onClose={() => setShow(false)} />}
    </div>
  )
}
