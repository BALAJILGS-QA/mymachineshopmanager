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
import { useAllocations, useDeductions } from '@/features/payments/hooks/useSettlements'
import { useExpenses } from '@/features/expenses/hooks/useExpenses'
import {
  useMaterials,
  useReceipts,
  useIssues,
  useAdjustments,
} from '@/features/materials/hooks/useMaterials'
import { currency, fmtDate, inRange, qty } from '@/lib/format'
import { downloadXlsx, type XlsxColumn } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Card, Select } from '@/components/ui/primitives'
import { CompanyFilter, DateRangeFilter, FilterBar } from '@/components/common/Filters'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'

type ReportKey =
  | 'jobs'
  | 'stock'
  | 'movement'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'outstanding'
  | 'settlement'
  | 'ageing'
  | 'deductions'
  | 'unknownDeductions'
  | 'customerOutstanding'

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'jobs', label: 'Job Order Report' },
  { key: 'stock', label: 'Material Stock Report' },
  { key: 'movement', label: 'Material Movement' },
  { key: 'invoices', label: 'Invoice Report' },
  { key: 'payments', label: 'Payment Register' },
  { key: 'expenses', label: 'Expense Report' },
  { key: 'outstanding', label: 'Outstanding Report' },
  { key: 'settlement', label: 'Invoice Settlement Report' },
  { key: 'ageing', label: 'Receivable Ageing' },
  { key: 'deductions', label: 'Deduction Report' },
  { key: 'unknownDeductions', label: 'Unknown Deduction Report' },
  { key: 'customerOutstanding', label: 'Customer Outstanding Report' },
]

// Ageing buckets by days since invoice date (no due-date field exists on
// invoices, so invoice date is the reference — see note in the report header).
function ageBucket(days: number): string {
  if (days <= 30) return '0–30'
  if (days <= 60) return '31–60'
  if (days <= 90) return '61–90'
  if (days <= 180) return '91–180'
  return '180+'
}

export function ReportsPage() {
  const { data: jobs = [] } = useJobs()
  const { data: materials = [] } = useMaterials()
  const { data: invoices = [] } = useInvoices()
  const { data: payments = [] } = usePayments()
  const { data: allocations = [] } = useAllocations()
  const { data: deductions = [] } = useDeductions()
  const { data: expenses = [] } = useExpenses()
  const { data: receipts = [] } = useReceipts()
  const { data: issues = [] } = useIssues()
  const { data: adjustments = [] } = useAdjustments()
  const db = useMemo(
    () => ({
      jobs,
      materials,
      invoices,
      payments,
      allocations,
      deductions,
      expenses,
      receipts,
      issues,
      adjustments,
    }),
    [
      jobs,
      materials,
      invoices,
      payments,
      allocations,
      deductions,
      expenses,
      receipts,
      issues,
      adjustments,
    ],
  )
  const companyName = useCompanyName()
  const materialName = useMaterialName()
  const invoiceNo = useMemo(() => {
    const m = new Map(invoices.map((i) => [i.id, i.invoiceNo]))
    return (id?: string) => (id ? (m.get(id) ?? '—') : '—')
  }, [invoices])

  const [report, setReport] = useState<ReportKey>('jobs')
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const dateless: ReportKey[] = [
    'stock',
    'outstanding',
    'settlement',
    'ageing',
    'customerOutstanding',
  ]
  const usesDate = !dateless.includes(report)

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
          .map((i) => ({ i, c: computeInvoice(i, db.payments, db.allocations, db.deductions) }))
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Invoice', value: (r) => r.i.invoiceNo },
          { header: 'Date', value: (r) => r.i.date },
          { header: 'Company', value: (r) => companyName(r.i.companyId) },
          { header: 'Total', value: (r) => r.c.total },
          { header: 'Paid', value: (r) => r.c.paid },
          { header: 'Deductions', value: (r) => r.c.knownDeductions + r.c.unknownDeduction },
          { header: 'Outstanding', value: (r) => r.c.outstanding },
          { header: 'Status', value: (r) => r.i.status },
        ]
        const total = rows.reduce((a, r) => a + r.c.total, 0)
        return { columns: cols, rows, footer: `Invoiced ${currency(total)}` }
      }
      case 'payments': {
        const allocByPayment = new Map<string, number>()
        for (const a of db.allocations)
          allocByPayment.set(a.paymentId, (allocByPayment.get(a.paymentId) ?? 0) + a.amount)
        const dedByPayment = new Map<string, { known: number; unknown: number }>()
        for (const d of db.deductions) {
          const e = dedByPayment.get(d.paymentId) ?? { known: 0, unknown: 0 }
          if (d.deductionType === 'Unidentified') e.unknown += d.amount
          else e.known += d.amount
          dedByPayment.set(d.paymentId, e)
        }
        const rows = db.payments
          .filter((p) => matchCompany(p.companyId) && inRange(p.date, from, to))
          .map((p) => {
            const allocated = allocByPayment.get(p.id) ?? (p.invoiceId ? p.amount : 0)
            const ded = dedByPayment.get(p.id) ?? { known: 0, unknown: 0 }
            const advance = Math.max(0, p.amount - allocated)
            return { p, allocated, known: ded.known, unknown: ded.unknown, advance }
          })
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Payment', value: (r) => r.p.paymentNo },
          { header: 'Date', value: (r) => r.p.date },
          { header: 'Company', value: (r) => companyName(r.p.companyId) },
          { header: 'Method', value: (r) => r.p.method },
          { header: 'UTR / Ref', value: (r) => r.p.reference ?? '' },
          { header: 'Amount', value: (r) => r.p.amount },
          { header: 'Allocated', value: (r) => r.allocated },
          { header: 'Known Ded', value: (r) => r.known },
          { header: 'Unknown Ded', value: (r) => r.unknown },
          { header: 'Advance', value: (r) => r.advance },
        ]
        const total = rows.reduce((a, r) => a + r.p.amount, 0)
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
            (i) => matchCompany(i.companyId) && i.status !== 'Draft' && i.status !== 'Cancelled',
          )
          .map((i) => ({ i, c: computeInvoice(i, db.payments, db.allocations, db.deductions) }))
          .filter((r) => r.c.outstanding > 0.005)
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
      case 'settlement': {
        // Per-invoice settlement breakdown incl. per-type deduction totals.
        const dedFor = (invId: string, type: string) =>
          db.deductions
            .filter((d) => d.invoiceId === invId && d.deductionType === type)
            .reduce((s, d) => s + d.amount, 0)
        const otherFor = (invId: string) =>
          db.deductions
            .filter(
              (d) =>
                d.invoiceId === invId &&
                !['TDS', 'Transportation', 'Unidentified'].includes(d.deductionType),
            )
            .reduce((s, d) => s + d.amount, 0)
        const rows = db.invoices
          .filter(
            (i) => matchCompany(i.companyId) && i.status !== 'Draft' && i.status !== 'Cancelled',
          )
          .map((i) => ({ i, c: computeInvoice(i, db.payments, db.allocations, db.deductions) }))
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Invoice', value: (r) => r.i.invoiceNo },
          { header: 'Company', value: (r) => companyName(r.i.companyId) },
          { header: 'Total', value: (r) => r.c.total },
          { header: 'Paid', value: (r) => r.c.paid },
          { header: 'TDS', value: (r) => dedFor(r.i.id, 'TDS') },
          { header: 'Transport', value: (r) => dedFor(r.i.id, 'Transportation') },
          { header: 'Other Ded', value: (r) => otherFor(r.i.id) },
          { header: 'Unknown Ded', value: (r) => r.c.unknownDeduction },
          { header: 'Outstanding', value: (r) => r.c.outstanding },
          { header: 'Status', value: (r) => r.i.status },
        ]
        const total = rows.reduce((a, r) => a + r.c.outstanding, 0)
        return { columns: cols, rows, footer: `Outstanding ${currency(total)}` }
      }
      case 'ageing': {
        const todayMs = Date.now()
        const rows = db.invoices
          .filter(
            (i) => matchCompany(i.companyId) && i.status !== 'Draft' && i.status !== 'Cancelled',
          )
          .map((i) => {
            const c = computeInvoice(i, db.payments, db.allocations, db.deductions)
            const days = Math.max(0, Math.floor((todayMs - new Date(i.date).getTime()) / 86400000))
            return { i, c, days, bucket: ageBucket(days) }
          })
          .filter((r) => r.c.outstanding > 0.005)
          .sort((a, b) => b.days - a.days)
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Invoice', value: (r) => r.i.invoiceNo },
          { header: 'Company', value: (r) => companyName(r.i.companyId) },
          { header: 'Date', value: (r) => r.i.date },
          { header: 'Outstanding', value: (r) => r.c.outstanding },
          { header: 'Age (days)', value: (r) => r.days },
          { header: 'Bucket', value: (r) => r.bucket },
        ]
        const total = rows.reduce((a, r) => a + r.c.outstanding, 0)
        return { columns: cols, rows, footer: `Outstanding ${currency(total)}` }
      }
      case 'deductions': {
        const rows = db.deductions
          .map((d) => ({ d, p: db.payments.find((pp) => pp.id === d.paymentId) }))
          .filter(({ p }) => matchCompany(p?.companyId) && (!p || inRange(p.date, from, to)))
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Payment', value: (r) => r.p?.paymentNo ?? '—' },
          { header: 'Date', value: (r) => r.p?.date ?? '' },
          { header: 'Company', value: (r) => (r.p ? companyName(r.p.companyId) : '—') },
          { header: 'Invoice', value: (r) => invoiceNo(r.d.invoiceId) },
          { header: 'Type', value: (r) => r.d.deductionType },
          { header: 'Calc', value: (r) => r.d.calcType },
          { header: 'Rate', value: (r) => r.d.rate ?? '' },
          { header: 'Amount', value: (r) => r.d.amount },
          { header: 'Remarks', value: (r) => r.d.remarks ?? '' },
        ]
        const total = rows.reduce((a, r) => a + r.d.amount, 0)
        return { columns: cols, rows, footer: `Deductions ${currency(total)}` }
      }
      case 'unknownDeductions': {
        const todayMs = Date.now()
        const rows = db.deductions
          .filter((d) => d.deductionType === 'Unidentified')
          .map((d) => ({ d, p: db.payments.find((pp) => pp.id === d.paymentId) }))
          .filter(({ p }) => matchCompany(p?.companyId) && (!p || inRange(p.date, from, to)))
          .map(({ d, p }) => {
            const days = p
              ? Math.max(0, Math.floor((todayMs - new Date(p.date).getTime()) / 86400000))
              : 0
            return { d, p, days }
          })
          .sort((a, b) => b.days - a.days)
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Payment', value: (r) => r.p?.paymentNo ?? '—' },
          { header: 'Company', value: (r) => (r.p ? companyName(r.p.companyId) : '—') },
          { header: 'Invoice', value: (r) => invoiceNo(r.d.invoiceId) },
          { header: 'Amount', value: (r) => r.d.amount },
          { header: 'Payment Date', value: (r) => r.p?.date ?? '' },
          { header: 'Age (days)', value: (r) => r.days },
          { header: 'Remarks', value: (r) => r.d.remarks ?? '' },
        ]
        const total = rows.reduce((a, r) => a + r.d.amount, 0)
        return { columns: cols, rows, footer: `Unknown difference ${currency(total)} — follow up` }
      }
      case 'customerOutstanding': {
        const byCompany = new Map<
          string,
          { count: number; value: number; paid: number; deductions: number; outstanding: number }
        >()
        for (const i of db.invoices) {
          if (i.status === 'Draft' || i.status === 'Cancelled') continue
          if (!matchCompany(i.companyId)) continue
          const c = computeInvoice(i, db.payments, db.allocations, db.deductions)
          const e = byCompany.get(i.companyId) ?? {
            count: 0,
            value: 0,
            paid: 0,
            deductions: 0,
            outstanding: 0,
          }
          e.count += 1
          e.value += c.total
          e.paid += c.paid
          e.deductions += c.knownDeductions + c.unknownDeduction
          e.outstanding += Math.max(0, c.outstanding)
          byCompany.set(i.companyId, e)
        }
        const rows = [...byCompany.entries()]
          .map(([companyId, e]) => ({ companyId, ...e }))
          .sort((a, b) => b.outstanding - a.outstanding)
        const cols: XlsxColumn<(typeof rows)[number]>[] = [
          { header: 'Company', value: (r) => companyName(r.companyId) },
          { header: 'Invoices', value: (r) => r.count },
          { header: 'Invoice Value', value: (r) => r.value },
          { header: 'Paid', value: (r) => r.paid },
          { header: 'Deductions', value: (r) => r.deductions },
          { header: 'Outstanding', value: (r) => r.outstanding },
        ]
        const total = rows.reduce((a, r) => a + r.outstanding, 0)
        return { columns: cols, rows, footer: `Total outstanding ${currency(total)}` }
      }
    }
    // `db` carries materials/receipts/issues/adjustments; store is derived from them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, company, from, to, db, companyName, materialName, invoiceNo])

  const pg = usePagination(rows as unknown[])

  function isMoney(header: string) {
    return [
      'Total',
      'Paid',
      'Outstanding',
      'Amount',
      'Value',
      'Invoice Value',
      'Deductions',
      'Allocated',
      'Known Ded',
      'Unknown Ded',
      'Advance',
      'TDS',
      'Transport',
      'Other Ded',
    ].includes(header)
  }
  function isQty(header: string) {
    return [
      'Ordered',
      'Completed',
      'Pending',
      'Received',
      'Issued',
      'Balance',
      'Qty',
      'Invoices',
      'Age (days)',
    ].includes(header)
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
          <ResponsiveTable className="min-w-[52rem]">
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
