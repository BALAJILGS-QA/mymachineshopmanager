import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import {
  computeInvoice,
  jobPendingQty,
  materialStock,
  materialStockValue,
  type StockDb,
} from '@/data/computations'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { usePayments } from '@/features/payments/hooks/usePayments'
import { useExpenses } from '@/features/expenses/hooks/useExpenses'
import {
  useMaterials,
  useReceipts,
  useIssues,
  useAdjustments,
} from '@/features/materials/hooks/useMaterials'
import { currency, fmtDate, qty } from '@/lib/format'
import { downloadXlsx, type XlsxColumn } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Card, Select } from '@/components/ui/primitives'
import { CompanyFilter, DateRangeFilter, FilterBar, inRange } from '@/components/common/Filters'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'

type ReportKey =
  'jobs' | 'stock' | 'movement' | 'invoices' | 'payments' | 'expenses' | 'outstanding'

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'jobs', label: 'Job Order Report' },
  { key: 'stock', label: 'Material Stock Report' },
  { key: 'movement', label: 'Material Movement' },
  { key: 'invoices', label: 'Invoice Report' },
  { key: 'payments', label: 'Payment Report' },
  { key: 'expenses', label: 'Expense Report' },
  { key: 'outstanding', label: 'Outstanding Report' },
]

export function ReportsPage() {
  const { data: jobs = [] } = useJobs()
  const { data: materials = [] } = useMaterials()
  const { data: invoices = [] } = useInvoices()
  const { data: payments = [] } = usePayments()
  const { data: expenses = [] } = useExpenses()
  const { data: receipts = [] } = useReceipts()
  const { data: issues = [] } = useIssues()
  const { data: adjustments = [] } = useAdjustments()
  const db = useMemo(
    () => ({ jobs, materials, invoices, payments, expenses, receipts, issues, adjustments }),
    [jobs, materials, invoices, payments, expenses, receipts, issues, adjustments],
  )
  const companyName = useCompanyName()
  const materialName = useMaterialName()

  const [report, setReport] = useState<ReportKey>('jobs')
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const usesDate = report !== 'stock' && report !== 'outstanding'

  const { columns, rows, footer } = useMemo(() => {
    const matchCompany = (cid?: string) => !company || cid === company
    const store: StockDb = { materials, receipts, issues, adjustments }

    switch (report) {
      case 'jobs': {
        const rows = db.jobs.filter(
          (j) => matchCompany(j.companyId) && inRange(j.orderDate, from, to),
        )
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Job No', value: (j) => j.jobNo },
          { header: 'Company', value: (j) => companyName(j.companyId) },
          { header: 'Part', value: (j) => j.partName },
          { header: 'Ordered', value: (j) => j.orderedQty },
          { header: 'Completed', value: (j) => j.completedQty },
          { header: 'Pending', value: (j) => jobPendingQty(j.orderedQty, j.completedQty) },
          { header: 'Status', value: (j) => j.status },
          { header: 'Due', value: (j) => j.dueDate ?? '' },
        ]
        return { columns: cols, rows, footer: `${rows.length} jobs` }
      }
      case 'stock': {
        const rows = db.materials.map((m) => {
          const s = materialStock(store, m.id, company || undefined)
          return { m, s, value: materialStockValue(store, m.id) }
        })
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Material', value: (r) => r.m.name },
          { header: 'Owner', value: () => (company ? companyName(company) : 'All') },
          { header: 'Received', value: (r) => r.s.received },
          { header: 'Issued', value: (r) => r.s.issued },
          { header: 'Balance', value: (r) => r.s.balance },
          { header: 'Value', value: (r) => r.value },
        ]
        const totalVal = rows.reduce((a, r) => a + r.value, 0)
        return { columns: cols, rows, footer: `Total value ${currency(totalVal)}` }
      }
      case 'movement': {
        type Move = {
          date: string
          type: string
          ref: string
          material: string
          company: string
          qty: number
        }
        const moves: Move[] = []
        db.receipts.forEach((r) =>
          moves.push({
            date: r.date,
            type: 'Receipt',
            ref: r.receiptNo,
            material: materialName(r.materialId),
            company: r.companyId ? companyName(r.companyId) : 'Shop',
            qty: r.quantity,
          }),
        )
        db.issues.forEach((i) =>
          moves.push({
            date: i.date,
            type: 'Issue',
            ref: i.issueNo,
            material: materialName(i.materialId),
            company: companyName(i.companyId),
            qty: -i.quantity,
          }),
        )
        db.adjustments.forEach((a) =>
          moves.push({
            date: a.date,
            type: 'Adjustment',
            ref: a.adjNo,
            material: materialName(a.materialId),
            company: a.companyId ? companyName(a.companyId) : 'Overall',
            qty: a.quantity,
          }),
        )
        const rows = moves
          .filter((m) => inRange(m.date, from, to))
          .sort((a, b) => (a.date < b.date ? 1 : -1))
        const cols: XlsxColumn<Move>[] = [
          { header: 'Date', value: (m) => m.date },
          { header: 'Type', value: (m) => m.type },
          { header: 'Ref', value: (m) => m.ref },
          { header: 'Material', value: (m) => m.material },
          { header: 'Company', value: (m) => m.company },
          { header: 'Qty', value: (m) => m.qty },
        ]
        return { columns: cols, rows, footer: `${rows.length} movements` }
      }
      case 'invoices': {
        const rows = db.invoices
          .filter((i) => matchCompany(i.companyId) && inRange(i.date, from, to))
          .map((i) => ({ i, c: computeInvoice(i, db.payments) }))
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Invoice', value: (r) => r.i.invoiceNo },
          { header: 'Date', value: (r) => r.i.date },
          { header: 'Company', value: (r) => companyName(r.i.companyId) },
          { header: 'Total', value: (r) => r.c.total },
          { header: 'Paid', value: (r) => r.c.paid },
          { header: 'Outstanding', value: (r) => r.c.outstanding },
          { header: 'Status', value: (r) => r.i.status },
        ]
        const total = rows.reduce((a, r) => a + r.c.total, 0)
        return { columns: cols, rows, footer: `Invoiced ${currency(total)}` }
      }
      case 'payments': {
        const rows = db.payments.filter(
          (p) => matchCompany(p.companyId) && inRange(p.date, from, to),
        )
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Payment', value: (p) => p.paymentNo },
          { header: 'Date', value: (p) => p.date },
          { header: 'Company', value: (p) => companyName(p.companyId) },
          { header: 'Amount', value: (p) => p.amount },
          { header: 'Method', value: (p) => p.method },
          { header: 'Reference', value: (p) => p.reference ?? '' },
        ]
        const total = rows.reduce((a, r) => a + r.amount, 0)
        return { columns: cols, rows, footer: `Received ${currency(total)}` }
      }
      case 'expenses': {
        const rows = db.expenses.filter(
          (e) => matchCompany(e.companyId) && inRange(e.date, from, to),
        )
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Expense', value: (e) => e.expenseNo },
          { header: 'Date', value: (e) => e.date },
          { header: 'Category', value: (e) => e.category },
          { header: 'Amount', value: (e) => e.amount },
          { header: 'Company', value: (e) => companyName(e.companyId) },
        ]
        const total = rows.reduce((a, r) => a + r.amount, 0)
        return { columns: cols, rows, footer: `Spent ${currency(total)}` }
      }
      case 'outstanding': {
        const rows = db.invoices
          .filter(
            (i) => matchCompany(i.companyId) && ['Unpaid', 'Partially Paid'].includes(i.status),
          )
          .map((i) => ({ i, c: computeInvoice(i, db.payments) }))
          .filter((r) => r.c.outstanding > 0)
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Invoice', value: (r) => r.i.invoiceNo },
          { header: 'Company', value: (r) => companyName(r.i.companyId) },
          { header: 'Date', value: (r) => r.i.date },
          { header: 'Total', value: (r) => r.c.total },
          { header: 'Paid', value: (r) => r.c.paid },
          { header: 'Outstanding', value: (r) => r.c.outstanding },
        ]
        const total = rows.reduce((a, r) => a + r.c.outstanding, 0)
        return { columns: cols, rows, footer: `Total outstanding ${currency(total)}` }
      }
    }
  }, [report, company, from, to, db, companyName, materialName])

  const pg = usePagination(rows as unknown[])

  function isMoney(header: string) {
    return ['Total', 'Paid', 'Outstanding', 'Amount', 'Value'].includes(header)
  }
  function isQty(header: string) {
    return ['Ordered', 'Completed', 'Pending', 'Received', 'Issued', 'Balance', 'Qty'].includes(
      header,
    )
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Filter and export operational & financial data"
        actions={
          <button
            className="btn-primary"
            onClick={() =>
              downloadXlsx(
                REPORTS.find((r) => r.key === report)!
                  .label.replace(/\s+/g, '-')
                  .toLowerCase(),
                rows as never[],
                columns as XlsxColumn<never>[],
                REPORTS.find((r) => r.key === report)!.label,
              )
            }
          >
            <Download size={16} /> Export Excel
          </button>
        }
      />

      <FilterBar>
        <div>
          <label className="label">Report</label>
          <Select
            value={report}
            onChange={(e) => setReport(e.target.value as ReportKey)}
            className="min-w-[12rem]"
          >
            {REPORTS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <CompanyFilter value={company} onChange={setCompany} />
        {usesDate && <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />}
      </FilterBar>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-800">
            {REPORTS.find((r) => r.key === report)!.label}
          </h3>
          <span className="text-xs font-medium text-slate-500">{footer}</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            No data for the selected filters.
          </p>
        ) : (
          <ResponsiveTable>
            <thead>
              <tr className="border-b border-slate-100">
                {columns.map((c) => (
                  <th
                    key={c.header}
                    className={`th ${isMoney(c.header) || isQty(c.header) ? 'text-right' : ''}`}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(pg.pageItems as never[]).map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  {columns.map((c) => {
                    const raw = c.value(row)
                    const display = isMoney(c.header)
                      ? currency(Number(raw))
                      : isQty(c.header)
                        ? qty(Number(raw))
                        : c.header.toLowerCase().includes('date') && raw
                          ? fmtDate(String(raw))
                          : (raw ?? '—')
                    return (
                      <td
                        key={c.header}
                        className={`td ${isMoney(c.header) || isQty(c.header) ? 'text-right' : ''}`}
                      >
                        {display as never}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
        <Pagination pg={pg} />
      </Card>
    </div>
  )
}
