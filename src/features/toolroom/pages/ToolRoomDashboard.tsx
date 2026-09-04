import { useMemo } from 'react'
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Hammer,
  PackageX,
  Ruler,
  Send,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'
import { fmtDateTime, todayISO } from '@/lib/format'
import {
  useCalibrationRecords,
  useMaintenanceRecords,
  useToolInventory,
  useToolTransactions,
} from '../hooks/useToolroom'
import { titleCase } from '../toolroomUi'
import { txnLabel } from '../toolStock'
import type { ToolTxnType } from '../types'

const QUICK_LINKS = [
  { to: '/app/tool-room/tools', label: 'Tools', icon: Wrench, tone: 'blue' as const },
  { to: '/app/tool-room/inventory', label: 'Inventory', icon: Boxes, tone: 'cyan' as const },
  { to: '/app/tool-room/issue', label: 'Issue', icon: Send, tone: 'orange' as const },
  { to: '/app/tool-room/return', label: 'Return', icon: ClipboardList, tone: 'green' as const },
  {
    to: '/app/tool-room/reservations',
    label: 'Reservations',
    icon: CalendarClock,
    tone: 'purple' as const,
  },
  { to: '/app/tool-room/maintenance', label: 'Maintenance', icon: Hammer, tone: 'amber' as const },
  { to: '/app/tool-room/calibration', label: 'Calibration', icon: Ruler, tone: 'cyan' as const },
  { to: '/app/tool-room/reports', label: 'Reports', icon: Gauge, tone: 'slate' as const },
]

function daysUntil(date?: string): number | null {
  if (!date) return null
  const d = new Date(date).getTime()
  const now = new Date(todayISO()).getTime()
  return Math.round((d - now) / 86_400_000)
}

export function ToolRoomDashboard() {
  const inventory = useToolInventory().data ?? []
  const recent = useToolTransactions().data ?? []
  const maintenance = useMaintenanceRecords().list.data ?? []
  const calibrations = useCalibrationRecords().list.data ?? []

  const k = useMemo(() => {
    const sum = (f: (r: (typeof inventory)[number]) => number) =>
      inventory.reduce((s, r) => s + (f(r) || 0), 0)
    return {
      totalTools: inventory.length,
      totalQty: sum((r) => r.onHandQty),
      available: sum((r) => r.availableQty),
      issued: sum((r) => r.issuedQty),
      reserved: sum((r) => r.reservedQty),
      maintenance: sum((r) => r.maintenanceQty),
      calibration: sum((r) => r.calibrationQty),
      damaged: sum((r) => r.damagedQty),
      scrap: sum((r) => r.scrapQty),
      lowStock: inventory.filter((r) => r.isLowStock).length,
      outOfStock: inventory.filter((r) => r.availableQty <= 0).length,
    }
  }, [inventory])

  const alerts = useMemo(() => {
    const calibDue = calibrations.filter((c) => {
      if (c.status === 'failed') return false
      const d = daysUntil(c.dueDate)
      return d !== null && d <= 30
    })
    const calibOverdue = calibDue.filter((c) => (daysUntil(c.dueDate) ?? 99) < 0)
    const maintDue = maintenance.filter((m) => {
      if (m.status !== 'open') return false
      const d = daysUntil(m.dueDate)
      return d !== null && d <= 14
    })
    return { calibDue, calibOverdue, maintDue }
  }, [calibrations, maintenance])

  const dist: Array<{ label: string; value: number; tone: string }> = [
    { label: 'Available', value: k.available, tone: 'bg-green-500' },
    { label: 'Issued', value: k.issued, tone: 'bg-amber-500' },
    { label: 'Reserved', value: k.reserved, tone: 'bg-blue-500' },
    { label: 'Maintenance', value: k.maintenance, tone: 'bg-purple-500' },
    { label: 'Calibration', value: k.calibration, tone: 'bg-cyan-500' },
    { label: 'Damaged', value: k.damaged, tone: 'bg-red-500' },
    { label: 'Scrap', value: k.scrap, tone: 'bg-slate-400' },
  ]
  const distTotal = dist.reduce((s, d) => s + d.value, 0) || 1

  return (
    <div>
      <PageHeader
        title="Tool Room"
        subtitle="Tools, accessories & consumables — inventory, issue/return, maintenance and calibration"
      />

      {/* KPI tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          icon={<Wrench size={18} />}
          label="Total Tools"
          value={k.totalTools}
          tone="blue"
          to="/app/tool-room/tools"
        />
        <StatTile
          icon={<Boxes size={18} />}
          label="On-hand Qty"
          value={k.totalQty}
          tone="cyan"
          to="/app/tool-room/inventory"
        />
        <StatTile
          icon={<CheckCircle2 size={18} />}
          label="Available"
          value={k.available}
          tone="green"
        />
        <StatTile icon={<Send size={18} />} label="Issued" value={k.issued} tone="amber" />
        <StatTile
          icon={<CalendarClock size={18} />}
          label="Reserved"
          value={k.reserved}
          tone="purple"
        />
        <StatTile
          icon={<Hammer size={18} />}
          label="Maintenance"
          value={k.maintenance}
          tone="purple"
        />
        <StatTile
          icon={<Ruler size={18} />}
          label="Calibration"
          value={k.calibration}
          tone="cyan"
        />
        <StatTile icon={<ShieldAlert size={18} />} label="Damaged" value={k.damaged} tone="red" />
        <StatTile icon={<PackageX size={18} />} label="Scrapped" value={k.scrap} tone="slate" />
        <StatTile
          icon={<AlertTriangle size={18} />}
          label="Low Stock"
          value={k.lowStock}
          tone="amber"
          to="/app/tool-room/inventory"
        />
        <StatTile
          icon={<PackageX size={18} />}
          label="Out of Stock"
          value={k.outOfStock}
          tone="red"
          to="/app/tool-room/inventory"
        />
        <StatTile
          icon={<Ruler size={18} />}
          label="Calibration Due"
          value={alerts.calibDue.length}
          tone="orange"
          to="/app/tool-room/calibration"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Status distribution */}
        <Card className="p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Tool Status Distribution</h3>
          <div className="space-y-2.5">
            {dist.map((d) => (
              <div key={d.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-600">{d.label}</span>
                  <span className="font-semibold text-slate-900">{d.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${d.tone}`}
                    style={{ width: `${Math.round((d.value / distTotal) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Alerts */}
        <Card className="p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Important Alerts</h3>
          <div className="space-y-2 text-sm">
            <AlertLine
              tone="red"
              label="Calibration overdue"
              count={alerts.calibOverdue.length}
              to="/app/tool-room/calibration"
            />
            <AlertLine
              tone="orange"
              label="Calibration due ≤ 30 days"
              count={alerts.calibDue.length}
              to="/app/tool-room/calibration"
            />
            <AlertLine
              tone="amber"
              label="Maintenance due"
              count={alerts.maintDue.length}
              to="/app/tool-room/maintenance"
            />
            <AlertLine
              tone="amber"
              label="Low stock tools"
              count={k.lowStock}
              to="/app/tool-room/inventory"
            />
            <AlertLine
              tone="red"
              label="Out of stock tools"
              count={k.outOfStock}
              to="/app/tool-room/inventory"
            />
            <AlertLine
              tone="red"
              label="Damaged tools"
              count={inventory.filter((r) => r.damagedQty > 0).length}
              to="/app/tool-room/inventory"
            />
            {alerts.calibOverdue.length +
              alerts.calibDue.length +
              alerts.maintDue.length +
              k.lowStock +
              k.outOfStock ===
              0 && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                All clear — no outstanding alerts.
              </p>
            )}
          </div>
        </Card>

        {/* Recent activity */}
        <Card className="p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Recent Activity</h3>
          {recent.length === 0 ? (
            <p className="text-xs text-slate-500">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {txnLabel(t.txnType as ToolTxnType)} · {t.qty} {t.unit ?? ''}
                    </p>
                    <p className="truncate text-2xs text-slate-500">
                      {t.txnNo ?? ''} {t.machine ? `· ${t.machine}` : ''} · {fmtDateTime(t.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick links */}
      <Card className="mt-4 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {QUICK_LINKS.map((l) => (
            <AppLink
              key={l.to}
              to={l.to}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50"
            >
              <l.icon size={20} className="text-slate-500" />
              {l.label}
            </AppLink>
          ))}
        </div>
      </Card>
    </div>
  )
}

function AlertLine({
  tone,
  label,
  count,
  to,
}: {
  tone: string
  label: string
  count: number
  to: string
}) {
  const toneClass: Record<string, string> = {
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    amber: 'bg-amber-50 text-amber-700',
  }
  return (
    <AppLink
      to={to}
      className={`flex items-center justify-between rounded-lg px-3 py-2 ${count > 0 ? toneClass[tone] : 'bg-slate-50 text-slate-500'}`}
    >
      <span>{titleCase(label)}</span>
      <span className="font-bold">{count}</span>
    </AppLink>
  )
}
