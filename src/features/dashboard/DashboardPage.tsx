import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Factory,
  IndianRupee,
  PackageX,
  Receipt,
  Wallet,
  CheckCircle2,
} from 'lucide-react'
import { format, startOfMonth } from 'date-fns'
import { useDb } from '@/data/store'
import { getDb } from '@/data/db'
import {
  computeInvoice,
  materialStock,
  totalRawMaterialValue,
} from '@/data/computations'
import { currency, fmtDate, qty } from '@/lib/format'
import { Card } from '@/components/ui/primitives'
import { PageHeader } from '@/components/common/PageHeader'
import { JobStatusBadge, PriorityBadge } from '@/components/common/status'
import { useCompanyName } from '@/features/shared/lookups'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#64748b', '#ef4444', '#0ea5e9']

export function DashboardPage() {
  const jobs = useDb((db) => db.jobs)
  const invoices = useDb((db) => db.invoices)
  const payments = useDb((db) => db.payments)
  const expenses = useDb((db) => db.expenses)
  const materials = useDb((db) => db.materials)
  const stamp = useDb((db) => db.receipts.length + db.issues.length + db.adjustments.length)
  const companyName = useCompanyName()

  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const kpi = useMemo(() => {
    const db = getDb()
    const open = jobs.filter((j) => ['Pending', 'Draft'].includes(j.status)).length
    const inProd = jobs.filter((j) => j.status === 'In Progress').length
    const completedThisPeriod = jobs.filter(
      (j) => j.completedAt && j.completedAt.slice(0, 10) >= monthStart,
    ).length
    const rawValue = totalRawMaterialValue(db)
    const unpaid = invoices
      .filter((i) => i.status !== 'Cancelled')
      .reduce((s, i) => s + computeInvoice(i, payments).outstanding, 0)
    const paymentsThisMonth = payments
      .filter((p) => p.date >= monthStart)
      .reduce((s, p) => s + p.amount, 0)
    const expensesThisMonth = expenses
      .filter((e) => e.date >= monthStart)
      .reduce((s, e) => s + e.amount, 0)
    return { open, inProd, completedThisPeriod, rawValue, unpaid, paymentsThisMonth, expensesThisMonth }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, invoices, payments, expenses, stamp, monthStart])

  const pendingJobs = useMemo(
    () =>
      jobs
        .filter((j) => ['Pending', 'In Progress', 'On Hold'].includes(j.status))
        .sort((a, b) => {
          const rank = { Urgent: 0, High: 1, Normal: 2, Low: 3 }
          return rank[a.priority] - rank[b.priority]
        })
        .slice(0, 6),
    [jobs],
  )

  const lowStock = useMemo(() => {
    const db = getDb()
    return materials
      .map((m) => ({ m, bal: materialStock(db, m.id).balance }))
      .filter(({ m, bal }) => bal < 0 || (m.reorderLevel !== undefined && bal <= m.reorderLevel))
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, stamp])

  const recentPayments = payments.slice(0, 5)
  const recentExpenses = expenses.slice(0, 5)

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>()
    expenses
      .filter((e) => e.date >= monthStart)
      .forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount))
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [expenses, monthStart])

  const cashFlow = useMemo(() => {
    // last 6 months payments vs expenses
    const months: { key: string; label: string; payments: number; expenses: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM'), payments: 0, expenses: 0 })
    }
    const idx = new Map(months.map((m, i) => [m.key, i]))
    payments.forEach((p) => {
      const k = p.date.slice(0, 7)
      if (idx.has(k)) months[idx.get(k)!].payments += p.amount
    })
    expenses.forEach((e) => {
      const k = e.date.slice(0, 7)
      if (idx.has(k)) months[idx.get(k)!].expenses += e.amount
    })
    return months
  }, [payments, expenses])

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={fmtDate(format(new Date(), 'yyyy-MM-dd'))} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Kpi icon={ClipboardList} tone="amber" label="Open Job Orders" value={String(kpi.open)} to="/app/jobs" />
        <Kpi icon={Factory} tone="blue" label="In Production" value={String(kpi.inProd)} to="/app/production" />
        <Kpi
          icon={CheckCircle2}
          tone="green"
          label="Completed (month)"
          value={String(kpi.completedThisPeriod)}
          to="/app/jobs"
        />
        <Kpi
          icon={PackageX}
          tone="violet"
          label="Raw Material Value"
          value={currency(kpi.rawValue)}
          to="/app/materials"
        />
        <Kpi
          icon={IndianRupee}
          tone="red"
          label="Unpaid Invoices"
          value={currency(kpi.unpaid)}
          to="/app/invoices"
        />
        <Kpi
          icon={Wallet}
          tone="green"
          label="Payments (month)"
          value={currency(kpi.paymentsThisMonth)}
          to="/app/payments"
        />
        <Kpi
          icon={Receipt}
          tone="slate"
          label="Expenses (month)"
          value={currency(kpi.expensesThisMonth)}
          to="/app/expenses"
        />
        <Kpi
          icon={IndianRupee}
          tone="blue"
          label="Net (month)"
          value={currency(kpi.paymentsThisMonth - kpi.expensesThisMonth)}
          to="/app/reports"
        />
      </div>

      {/* Charts */}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Cash flow (last 6 months)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashFlow} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v: number) => currency(v)} />
                <Bar dataKey="payments" name="Payments" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Expenses by category (month)</h3>
          {expenseByCategory.length === 0 ? (
            <p className="py-16 text-center text-xs text-slate-400">No expenses this month</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
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
              </ResponsiveContainer>
            </div>
          )}
        </Card>
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
                    <p className="text-2xs text-slate-400">
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
          <ListHeader title="Low / negative stock" to="/app/materials" icon={<AlertTriangle size={15} className="text-amber-500" />} />
          {lowStock.length === 0 ? (
            <Empty text="All stock above reorder levels" />
          ) : (
            <div className="mt-2 divide-y divide-slate-50">
              {lowStock.map(({ m, bal }) => (
                <div key={m.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{m.name}</p>
                    <p className="text-2xs text-slate-400">
                      Reorder at {m.reorderLevel ?? 0} {m.unit}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${bal < 0 ? 'text-red-600' : 'text-amber-600'}`}>
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
                    <p className="text-2xs text-slate-400">
                      {fmtDate(p.date)} · {p.method}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600">{currency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <ListHeader title="Recent expenses" to="/app/expenses" />
          {recentExpenses.length === 0 ? (
            <Empty text="No expenses yet" />
          ) : (
            <div className="mt-2 divide-y divide-slate-50">
              {recentExpenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{e.category}</p>
                    <p className="text-2xs text-slate-400">
                      {fmtDate(e.date)} · {e.vendor || e.method}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{currency(e.amount)}</span>
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
    <Link to={to} className="card p-3.5 transition hover:shadow-md">
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${TONES[tone]}`}>
        <Icon size={17} />
      </div>
      <p className="text-lg font-bold leading-tight text-slate-900">{value}</p>
      <p className="text-2xs text-slate-500">{label}</p>
    </Link>
  )
}

function ListHeader({ title, to, icon }: { title: string; to: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        {icon}
        {title}
      </h3>
      <Link to={to} className="flex items-center gap-0.5 text-2xs font-medium text-brand-600 hover:underline">
        View all <ArrowRight size={12} />
      </Link>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-xs text-slate-400">{text}</p>
}
