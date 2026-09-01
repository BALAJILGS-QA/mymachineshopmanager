import { useMemo, useState } from 'react'
import { AppLink } from '@/components/nav/app-link'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  Factory,
  FileText,
  IndianRupee,
  PackageCheck,
  PackageX,
  Percent,
  Receipt,
  Send,
  Wallet,
  CheckCircle2,
} from 'lucide-react'
import { format, startOfMonth } from 'date-fns'
import {
  companyMaterialValue,
  computeInvoice,
  materialStock,
  totalRawMaterialValue,
  type StockDb,
} from '@/data/computations'
import { currency, fmtDate, qty } from '@/lib/format'
import { Card, Select } from '@/components/ui/primitives'
import { PageHeader } from '@/components/common/PageHeader'
import { WorkflowStepper } from '@/components/common/WorkflowStepper'
import { JobStatusBadge, PriorityBadge } from '@/components/common/status'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { usePayments } from '@/features/payments/hooks/usePayments'
import { useExpenses } from '@/features/expenses/hooks/useExpenses'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import {
  useMaterials,
  useReceipts,
  useIssues,
  useAdjustments,
} from '@/features/materials/hooks/useMaterials'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const PIE_COLORS = ['#ea580c', '#f59e0b', '#0ea5e9', '#ef4444', '#9a3412', '#a855f7', '#fb923c']

function lastMonths(n: number) {
  const months: { key: string; label: string }[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM') })
  }
  return months
}

export function DashboardPage() {
  const { data: jobs = [] } = useJobs()
  const { data: invoices = [] } = useInvoices()
  const { data: payments = [] } = usePayments()
  const { data: expenses = [] } = useExpenses()
  const { data: issues = [] } = useIssues()
  const { data: materials = [] } = useMaterials()
  const { data: companies = [] } = useCompanies()
  const { data: receipts = [] } = useReceipts()
  const { data: adjustments = [] } = useAdjustments()
  const stockDb: StockDb = { materials, receipts, issues, adjustments }
  const stamp = receipts.length + issues.length + adjustments.length
  const companyName = useCompanyName()
  const materialName = useMaterialName()

  const [company, setCompany] = useState('')
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const jobsF = useMemo(
    () => (company ? jobs.filter((j) => j.companyId === company) : jobs),
    [jobs, company],
  )
  const invoicesF = useMemo(
    () => (company ? invoices.filter((i) => i.companyId === company) : invoices),
    [invoices, company],
  )
  const paymentsF = useMemo(
    () => (company ? payments.filter((p) => p.companyId === company) : payments),
    [payments, company],
  )
  const expensesF = useMemo(
    () => (company ? expenses.filter((e) => e.companyId === company) : expenses),
    [expenses, company],
  )
  const issuesF = useMemo(
    () => (company ? issues.filter((i) => i.companyId === company) : issues),
    [issues, company],
  )

  const kpi = useMemo(() => {
    const db = stockDb
    const open = jobsF.filter((j) => ['Pending', 'Draft'].includes(j.status)).length
    const inProd = jobsF.filter((j) => j.status === 'In Progress').length
    const monthInvoices = invoicesF.filter((i) => i.status !== 'Cancelled' && i.date >= monthStart)
    const invoicedThisMonth = monthInvoices.reduce(
      (s, i) => s + computeInvoice(i, payments).total,
      0,
    )
    const gstThisMonth = monthInvoices.reduce(
      (s, i) => s + computeInvoice(i, payments).taxAmount,
      0,
    )
    const rawValue = company ? companyMaterialValue(db, company) : totalRawMaterialValue(db)
    const pending = invoicesF
      .filter((i) => i.status !== 'Cancelled')
      .reduce((s, i) => s + computeInvoice(i, payments).outstanding, 0)
    const paymentsThisMonth = paymentsF
      .filter((p) => p.date >= monthStart)
      .reduce((s, p) => s + p.amount, 0)
    const expensesThisMonth = expensesF
      .filter((e) => e.date >= monthStart)
      .reduce((s, e) => s + e.amount, 0)
    return {
      open,
      inProd,
      invoicedThisMonth,
      gstThisMonth,
      rawValue,
      pending,
      paymentsThisMonth,
      expensesThisMonth,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsF, invoicesF, paymentsF, expensesF, payments, stamp, monthStart, company])

  // Invoices raised vs Payments received — last 6 months.
  const invVsPay = useMemo(() => {
    const months = lastMonths(6).map((m) => ({ ...m, invoiced: 0, received: 0 }))
    const idx = new Map(months.map((m, i) => [m.key, i]))
    invoicesF
      .filter((i) => i.status !== 'Cancelled')
      .forEach((i) => {
        const k = i.date.slice(0, 7)
        if (idx.has(k)) months[idx.get(k)!].invoiced += computeInvoice(i, payments).total
      })
    paymentsF.forEach((p) => {
      const k = p.date.slice(0, 7)
      if (idx.has(k)) months[idx.get(k)!].received += p.amount
    })
    return months
  }, [invoicesF, paymentsF, payments])

  // Cash flow: payments vs expenses — last 6 months.
  const cashFlow = useMemo(() => {
    const months = lastMonths(6).map((m) => ({ ...m, payments: 0, expenses: 0 }))
    const idx = new Map(months.map((m, i) => [m.key, i]))
    paymentsF.forEach((p) => {
      const k = p.date.slice(0, 7)
      if (idx.has(k)) months[idx.get(k)!].payments += p.amount
    })
    expensesF.forEach((e) => {
      const k = e.date.slice(0, 7)
      if (idx.has(k)) months[idx.get(k)!].expenses += e.amount
    })
    return months
  }, [paymentsF, expensesF])

  // Materials dispatched (issued to jobs) — last 6 months.
  const dispatched = useMemo(() => {
    const months = lastMonths(6).map((m) => ({ ...m, qty: 0, count: 0 }))
    const idx = new Map(months.map((m, i) => [m.key, i]))
    issuesF.forEach((it) => {
      const k = it.date.slice(0, 7)
      if (idx.has(k)) {
        months[idx.get(k)!].qty += it.quantity
        months[idx.get(k)!].count += 1
      }
    })
    return months
  }, [issuesF])

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>()
    expensesF
      .filter((e) => e.date >= monthStart)
      .forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount))
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [expensesF, monthStart])

  const pendingJobs = useMemo(
    () =>
      jobsF
        .filter((j) => ['Pending', 'In Progress', 'On Hold'].includes(j.status))
        .sort((a, b) => {
          const rank = { Urgent: 0, High: 1, Normal: 2, Low: 3 }
          return rank[a.priority] - rank[b.priority]
        })
        .slice(0, 6),
    [jobsF],
  )

  const lowStock = useMemo(() => {
    const db = stockDb
    return materials
      .map((m) => ({ m, bal: materialStock(db, m.id, company || undefined).balance }))
      .filter(({ m, bal }) => bal < 0 || (m.reorderLevel !== undefined && bal <= m.reorderLevel))
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, stamp, company])

  const recentPayments = useMemo(
    () => [...paymentsF].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5),
    [paymentsF],
  )
  const recentIssues = useMemo(
    () => [...issuesF].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5),
    [issuesF],
  )

  const scopeLabel = company ? companyName(company) : 'All companies'

  // Shop-floor flow counts for the workflow stepper (from existing data).
  const flow = useMemo(() => {
    const inStock = materials.filter(
      (m) => materialStock(stockDb, m.id, company || undefined).balance > 0,
    ).length
    return {
      inStock,
      open: jobsF.filter((j) => ['Pending', 'Draft'].includes(j.status)).length,
      machining: jobsF.filter((j) => j.status === 'In Progress').length,
      ready: jobsF.filter((j) => j.status === 'Completed').length,
      dispatched: jobsF.filter((j) => j.status === 'Delivered').length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsF, materials, stamp, company])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${fmtDate(format(new Date(), 'yyyy-MM-dd'))} · ${scopeLabel}`}
        actions={
          <Select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="min-w-[12rem]"
            aria-label="Filter dashboard by company"
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        }
      />

      {/* Shop-floor flow — Received → Stock → Machining → Ready → Dispatched */}
      <WorkflowStepper
        stages={[
          {
            label: 'Material Stock',
            count: flow.inStock,
            icon: Boxes,
            to: '/app/materials',
            tone: 'brand',
          },
          {
            label: 'Job Orders',
            count: flow.open,
            icon: ClipboardList,
            to: '/app/jobs',
            tone: 'amber',
          },
          {
            label: 'In Machining',
            count: flow.machining,
            icon: Factory,
            to: '/app/production',
            tone: 'blue',
          },
          {
            label: 'Ready to Dispatch',
            count: flow.ready,
            icon: PackageCheck,
            to: '/app/production',
            tone: 'green',
          },
          {
            label: 'Dispatched',
            count: flow.dispatched,
            icon: Send,
            to: '/app/deliveries',
            tone: 'slate',
          },
        ]}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Kpi
          icon={FileText}
          tone="blue"
          label="Invoiced (month)"
          value={currency(kpi.invoicedThisMonth)}
          to="/app/invoices"
        />
        <Kpi
          icon={Percent}
          tone="violet"
          label="GST (month)"
          value={currency(kpi.gstThisMonth)}
          to="/app/reports"
        />
        <Kpi
          icon={Wallet}
          tone="green"
          label="Payments (month)"
          value={currency(kpi.paymentsThisMonth)}
          to="/app/payments"
        />
        <Kpi
          icon={IndianRupee}
          tone="red"
          label="Pending Payments"
          value={currency(kpi.pending)}
          to="/app/invoices"
        />
        <Kpi
          icon={Receipt}
          tone="amber"
          label="Expenses (month)"
          value={currency(kpi.expensesThisMonth)}
          to="/app/expenses"
        />
        <Kpi
          icon={ClipboardList}
          tone="amber"
          label="Open Job Orders"
          value={String(kpi.open)}
          to="/app/jobs"
        />
        <Kpi
          icon={Factory}
          tone="blue"
          label="In Production"
          value={String(kpi.inProd)}
          to="/app/production"
        />
        <Kpi
          icon={PackageX}
          tone="violet"
          label="Raw Material Value"
          value={currency(kpi.rawValue)}
          to="/app/materials"
        />
        <Kpi
          icon={CheckCircle2}
          tone="green"
          label="Net (month)"
          value={currency(kpi.paymentsThisMonth - kpi.expensesThisMonth)}
          to="/app/reports"
        />
      </div>

      {/* Charts row 1 */}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartCard
          title="Invoices raised vs Payments received (6 months)"
          className="lg:col-span-2"
        >
          <BarChart data={invVsPay} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(v: number) => currency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="invoiced" name="Invoiced" fill="#fb923c" radius={[3, 3, 0, 0]} />
            <Bar dataKey="received" name="Received" fill="#9a3412" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard
          title="Expenses by category (month)"
          empty={expenseByCategory.length === 0}
          emptyText="No expenses this month"
        >
          <PieChart>
            <Pie
              data={expenseByCategory}
              dataKey="value"
              nameKey="name"
              innerRadius={40}
              outerRadius={72}
              paddingAngle={2}
            >
              {expenseByCategory.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => currency(v)} />
          </PieChart>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title="Materials dispatched per month (qty issued)"
          empty={dispatched.every((d) => d.qty === 0)}
          emptyText="No material issues in this period"
        >
          <BarChart data={dispatched}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip formatter={(v: number) => qty(v)} />
            <Bar dataKey="qty" name="Dispatched" fill="#c2410c" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Cash flow: Payments vs Expenses (6 months)">
          <BarChart data={cashFlow} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(v: number) => currency(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="payments" name="Payments" fill="#ea580c" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      {/* Lists */}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <ListHeader title="Priority jobs" to="/app/jobs" />
          {pendingJobs.length === 0 ? (
            <Empty text="No pending jobs" />
          ) : (
            <div className="mt-2 divide-y divide-slate-50">
              {pendingJobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{j.partName}</p>
                    <p className="text-2xs text-slate-600">
                      {j.jobNo} · {companyName(j.companyId)} · due {fmtDate(j.dueDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PriorityBadge priority={j.priority} />
                    <JobStatusBadge status={j.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <ListHeader
            title="Low / negative stock"
            to="/app/materials"
            icon={<AlertTriangle size={15} className="text-amber-500" />}
          />
          {lowStock.length === 0 ? (
            <Empty text="All stock above reorder levels" />
          ) : (
            <div className="mt-2 divide-y divide-slate-50">
              {lowStock.map(({ m, bal }) => (
                <div key={m.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{m.name}</p>
                    <p className="text-2xs text-slate-600">
                      Reorder at {m.reorderLevel ?? 0} {m.unit}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${bal < 0 ? 'text-red-600' : 'text-amber-600'}`}
                  >
                    {qty(bal)} {m.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <ListHeader title="Recent payments" to="/app/payments" />
          {recentPayments.length === 0 ? (
            <Empty text="No payments yet" />
          ) : (
            <div className="mt-2 divide-y divide-slate-50">
              {recentPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{companyName(p.companyId)}</p>
                    <p className="text-2xs text-slate-600">
                      {fmtDate(p.date)} · {p.method}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">
                    {currency(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <ListHeader
            title="Recent material dispatches"
            to="/app/materials"
            icon={<Send size={15} className="text-violet-500" />}
          />
          {recentIssues.length === 0 ? (
            <Empty text="No material issues yet" />
          ) : (
            <div className="mt-2 divide-y divide-slate-50">
              {recentIssues.map((it) => (
                <div key={it.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {materialName(it.materialId)}
                    </p>
                    <p className="text-2xs text-slate-600">
                      {fmtDate(it.date)} · {it.issueNo}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">
                    {qty(it.quantity)} {it.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

const TONES: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  to,
}: {
  icon: typeof ClipboardList
  label: string
  value: string
  tone: string
  to: string
}) {
  return (
    <AppLink
      to={to}
      className="card flex items-center justify-between gap-3 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50/60"
    >
      <div className="min-w-0">
        <p className="truncate text-2xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="tnum mt-1 truncate text-xl font-bold leading-none text-slate-900">{value}</p>
      </div>
      <div
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}
      >
        <Icon size={18} />
      </div>
    </AppLink>
  )
}

function ChartCard({
  title,
  children,
  className,
  empty,
  emptyText,
}: {
  title: string
  children: React.ReactElement
  className?: string
  empty?: boolean
  emptyText?: string
}) {
  return (
    <Card className={`p-4 ${className ?? ''}`}>
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="h-56">
        {empty ? (
          <Empty text={emptyText ?? 'No data'} tall />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

function ListHeader({ title, to, icon }: { title: string; to: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        {icon}
        {title}
      </h3>
      <AppLink
        to={to}
        className="flex items-center gap-0.5 text-2xs font-medium text-brand-600 hover:underline"
      >
        View all <ArrowRight size={12} />
      </AppLink>
    </div>
  )
}

function Empty({ text, tall }: { text: string; tall?: boolean }) {
  return <p className={`text-center text-xs text-slate-500 ${tall ? 'py-20' : 'py-8'}`}>{text}</p>
}
