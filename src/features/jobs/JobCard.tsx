import { clsx } from 'clsx'
import type { JobOrder } from '@/types'
import { SHOP_SCOPE, jobPendingQty } from '@/data/computations'
import { Modal } from '@/components/ui/Modal'
import { JobStatusBadge, PriorityBadge } from '@/components/common/status'
import { fmtDate, qty } from '@/lib/format'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { useMaterialBalance } from '@/features/materials/hooks/useMaterials'

// Read-only production-planning Job Card. Uses only data that exists in MSMS —
// no invented BOM / finished-goods logic. Material readiness shows the linked raw
// material's live availability (reusing material_balance); it does not claim a
// consumption/shortage figure because there is no BOM.
export function JobCard({ job, onClose }: { job: JobOrder; onClose: () => void }) {
  const companyName = useCompanyName()
  const materialName = useMaterialName()
  const { data: materialAvail = 0 } = useMaterialBalance(job.materialId ?? '', SHOP_SCOPE)

  const planned = job.plannedQty ?? job.orderedQty
  const balance = jobPendingQty(job.orderedQty, job.completedQty)
  const balanceToProduce = Math.max(0, planned - job.completedQty)
  const progress = job.orderedQty > 0 ? Math.round((job.completedQty / job.orderedQty) * 100) : 0
  const materialReady = !job.materialId ? null : materialAvail > 0

  return (
    <Modal open onClose={onClose} size="lg" title={`Job Card — ${job.jobNo}`}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-4">
          <div>
            <div className="font-mono text-lg font-bold text-slate-900">{job.jobNo}</div>
            <div className="text-sm text-slate-600">{job.partName}</div>
          </div>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={job.priority} />
            <JobStatusBadge status={job.status} />
          </div>
        </div>

        <Grid title="Details">
          <Item label="Customer" value={companyName(job.companyId)} />
          <Item label="Customer PO" value={job.customerPo || '—'} />
          <Item label="Product / Part" value={job.partName} />
          <Item label="Part / Drawing No." value={job.partNumber || '—'} />
          <Item label="Raw Material" value={job.materialId ? materialName(job.materialId) : '—'} />
          <Item label="Order Date" value={fmtDate(job.orderDate)} />
          <Item label="Due Date" value={fmtDate(job.dueDate)} />
        </Grid>

        <Grid title="Order Summary">
          <Item label="Ordered Qty" value={qty(job.orderedQty)} />
          <Item label="Production Required" value={qty(job.orderedQty)} />
          <Item label="Planned Qty" value={qty(planned)} />
          <Item label="Completed Qty" value={qty(job.completedQty)} />
          <Item label="Balance Qty" value={qty(balance)} strong />
        </Grid>

        <Grid title="Production Status">
          <Item label="Status" value={job.status} />
          <Item label="Progress" value={`${progress}%`} />
          <div className="sm:col-span-3">
            <div className="label text-slate-500">Progress</div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </div>
          <Item label="Produced" value={qty(job.completedQty)} />
          <Item label="Balance to Produce" value={qty(balanceToProduce)} />
        </Grid>

        {job.materialId && (
          <Grid title="Material Readiness">
            <Item label="Raw Material" value={materialName(job.materialId)} />
            <Item label="Available (own stock)" value={qty(materialAvail)} />
            <div className="flex items-end">
              <span
                className={clsx(
                  'rounded-full px-2.5 py-1 text-2xs font-bold ring-1',
                  materialReady
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-red-50 text-red-700 ring-red-200',
                )}
              >
                {materialReady ? '🟢 Material in stock' : '🔴 No material'}
              </span>
            </div>
          </Grid>
        )}
      </div>
    </Modal>
  )
}

function Grid({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">{children}</div>
    </section>
  )
}

function Item({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-2xs text-slate-400">{label}</div>
      <div
        className={
          strong ? 'text-sm font-bold text-slate-900' : 'text-sm font-medium text-slate-800'
        }
      >
        {value}
      </div>
    </div>
  )
}
