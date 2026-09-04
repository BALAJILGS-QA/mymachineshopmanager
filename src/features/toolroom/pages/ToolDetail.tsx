import { useMemo, useState } from 'react'
import { ArrowLeft, Wrench } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'
import { currency, fmtDate } from '@/lib/format'
import {
  useCalibrationRecords,
  useMaintenanceRecords,
  useTool,
  useToolCategories,
  useToolInventory,
  useToolTransactions,
} from '../hooks/useToolroom'
import { ToolActionsMenu } from '../components/ToolActionsMenu'
import { ToolTxnTable } from '../components/ToolTxnTable'
import { AvailCell, InfoRow, ToolStatusBadge, titleCase } from '../toolroomUi'
import { computeToolLife, computeToolStock } from '../toolStock'

const TABS = ['Overview', 'Movement Ledger', 'Maintenance', 'Calibration'] as const
type Tab = (typeof TABS)[number]

export function ToolDetail({ toolId }: { toolId: string }) {
  const tool = useTool(toolId).data
  const inventory = useToolInventory().data ?? []
  const categories = useToolCategories().list.data ?? []
  const txns = useToolTransactions(toolId).data ?? []
  const maintenance = (useMaintenanceRecords().list.data ?? []).filter((m) => m.toolId === toolId)
  const calibrations = (useCalibrationRecords().list.data ?? []).filter((c) => c.toolId === toolId)
  const [tab, setTab] = useState<Tab>('Overview')

  const stock = useMemo(() => computeToolStock(txns), [txns])

  // Tool life: consumption-based uses consumed qty; time-based uses age in days.
  const life = useMemo(() => {
    if (!tool?.expectedLife) return null
    const consumed = stock.consumed
    const used =
      tool.lifeUnit === 'days' && tool.purchaseDate
        ? Math.max(0, Math.round((Date.now() - new Date(tool.purchaseDate).getTime()) / 86_400_000))
        : consumed
    return computeToolLife(tool.expectedLife, used)
  }, [tool, stock])

  if (!tool) {
    return (
      <div>
        <PageHeader title="Tool" />
        <Card className="p-6 text-center text-sm text-slate-500">Loading tool…</Card>
      </div>
    )
  }

  return (
    <div>
      <AppLink
        to="/app/tool-room/tools"
        className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={14} /> Back to tools
      </AppLink>
      <PageHeader
        title={tool.name}
        subtitle={`${tool.code ? tool.code + ' · ' : ''}${titleCase(tool.classification)} · ${tool.uom ?? 'nos'}`}
        actions={
          <div className="flex items-center gap-2">
            <ToolStatusBadge status={tool.status} />
            <ToolActionsMenu inventory={inventory} toolId={toolId} triggerLabel="Actions" />
          </div>
        }
      />

      {/* Availability strip */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <AvailCell label="Available" value={stock.available} tone="text-green-600" />
        <AvailCell label="Issued" value={stock.issued} tone="text-amber-600" />
        <AvailCell label="Reserved" value={stock.reserved} tone="text-blue-600" />
        <AvailCell label="Maintenance" value={stock.maintenance} tone="text-violet-600" />
        <AvailCell label="Calibration" value={stock.calibration} tone="text-cyan-600" />
        <AvailCell label="Damaged" value={stock.damaged} tone="text-red-600" />
        <AvailCell label="Scrap" value={stock.scrap} />
        <AvailCell label="On hand" value={stock.onHand} />
      </div>

      {/* Tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
              tab === t
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Details</h3>
            <InfoRow label="Category">
              {categories.find((c) => c.id === tool.categoryId)?.name || '—'}
            </InfoRow>
            <InfoRow label="Brand">{tool.brand || '—'}</InfoRow>
            <InfoRow label="Manufacturer">{tool.manufacturer || '—'}</InfoRow>
            <InfoRow label="Part number">{tool.partNumber || '—'}</InfoRow>
            <InfoRow label="Serial">{tool.serialNumber || '—'}</InfoRow>
            <InfoRow label="Specification">{tool.specification || '—'}</InfoRow>
            <InfoRow label="Material / grade">{tool.material || '—'}</InfoRow>
            <InfoRow label="Kind">{tool.isConsumable ? 'Consumable' : 'Reusable'}</InfoRow>
            <InfoRow label="Unit cost">
              {tool.unitCost != null ? currency(tool.unitCost) : '—'}
            </InfoRow>
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Inventory &amp; lifecycle</h3>
            <InfoRow label="Location">
              {tool.toolRoomLocation || tool.storeLocation || tool.binLocation || '—'}
            </InfoRow>
            <InfoRow label="Min stock">{tool.minStock ?? 0}</InfoRow>
            <InfoRow label="Reorder level">{tool.reorderLevel ?? 0}</InfoRow>
            <InfoRow label="Reorder qty">{tool.reorderQty ?? 0}</InfoRow>
            <InfoRow label="Purchase date">{fmtDate(tool.purchaseDate)}</InfoRow>
            <InfoRow label="Controls">
              {[
                tool.calibrationRequired && 'Calibration',
                tool.maintenanceRequired && 'Maintenance',
                tool.inspectionRequired && 'Inspection',
                tool.isSerialized && 'Serialized',
              ]
                .filter(Boolean)
                .join(', ') || '—'}
            </InfoRow>
            {life && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-600">
                    Tool life ({tool.expectedLife} {tool.lifeUnit ?? 'units'})
                  </span>
                  <span className="font-semibold text-slate-900">{life.usagePercent}% used</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={clsx(
                      'h-full rounded-full',
                      life.stage === 'expired' || life.stage === 'critical'
                        ? 'bg-red-500'
                        : life.stage === 'warn'
                          ? 'bg-amber-500'
                          : 'bg-green-500',
                    )}
                    style={{ width: `${life.usagePercent}%` }}
                  />
                </div>
                <p className="mt-1 text-2xs text-slate-500">{life.remaining} remaining</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'Movement Ledger' && (
        <Card>
          <ToolTxnTable toolId={toolId} showBalance emptyTitle="No movements for this tool" />
        </Card>
      )}

      {tab === 'Maintenance' && (
        <Card className="p-4">
          {maintenance.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No maintenance history.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {maintenance.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">
                      {titleCase(m.maintenanceType)} · {m.maintenanceNo}
                    </p>
                    <p className="text-xs text-slate-500">
                      {fmtDate(m.maintenanceDate)} · {m.serviceProvider || '—'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">
                    {titleCase(m.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'Calibration' && (
        <Card className="p-4">
          {calibrations.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No calibration history.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {calibrations.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{c.calibrationNo}</p>
                    <p className="text-xs text-slate-500">
                      {fmtDate(c.calibrationDate)} · due {fmtDate(c.dueDate)} · {c.agency || '—'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">
                    {titleCase(c.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}

export function ToolDetailEmpty() {
  return (
    <Card className="p-8 text-center">
      <Wrench size={40} className="mx-auto mb-2 text-slate-300" />
      <p className="text-sm text-slate-500">Tool not found.</p>
    </Card>
  )
}
