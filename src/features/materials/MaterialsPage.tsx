import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Download,
  Pencil,
  Plus,
  Sliders,
  Trash2,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { Material } from '@/types'
import { materialRepo, stockRepo, BusinessRuleError } from '@/data/repo'
import { useDb } from '@/data/store'
import { materialStock, materialStockValue } from '@/data/computations'
import { getDb } from '@/data/db'
import { currency, fmtDate, qty } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName, useJobNo, useMaterialName } from '@/features/shared/lookups'
import { AdjustmentForm, IssueForm, MaterialForm, ReceiptForm } from './MaterialForms'

type Tab = 'stock' | 'materials' | 'receipts' | 'issues' | 'adjustments'
type Dialog = 'material' | 'receipt' | 'issue' | 'adjustment' | null

const TABS: { key: Tab; label: string }[] = [
  { key: 'stock', label: 'Stock Balance' },
  { key: 'materials', label: 'Materials' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'issues', label: 'Issues' },
  { key: 'adjustments', label: 'Adjustments' },
]

export function MaterialsPage() {
  const [tab, setTab] = useState<Tab>('stock')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [editMaterial, setEditMaterial] = useState<Material | null>(null)

  return (
    <div>
      <PageHeader
        title="Materials & Stock"
        subtitle="Receipts, issues, adjustments and company-wise balances"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setDialog('adjustment')}>
              <Sliders size={16} /> Adjust
            </button>
            <button className="btn-secondary" onClick={() => setDialog('issue')}>
              <ArrowUpFromLine size={16} /> Issue
            </button>
            <button className="btn-primary" onClick={() => setDialog('receipt')}>
              <ArrowDownToLine size={16} /> Receive
            </button>
          </>
        }
      />

      <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg bg-slate-200/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stock' && <StockTab />}
      {tab === 'materials' && (
        <MaterialsTab
          onAdd={() => {
            setEditMaterial(null)
            setDialog('material')
          }}
          onEdit={(m) => {
            setEditMaterial(m)
            setDialog('material')
          }}
        />
      )}
      {tab === 'receipts' && <ReceiptsTab />}
      {tab === 'issues' && <IssuesTab />}
      {tab === 'adjustments' && <AdjustmentsTab />}

      {dialog === 'material' && (
        <MaterialForm material={editMaterial} onClose={() => setDialog(null)} />
      )}
      {dialog === 'receipt' && <ReceiptForm onClose={() => setDialog(null)} />}
      {dialog === 'issue' && <IssueForm onClose={() => setDialog(null)} />}
      {dialog === 'adjustment' && <AdjustmentForm onClose={() => setDialog(null)} />}
    </div>
  )
}

// ------------------------------------------------------------------- Stock tab
function StockTab() {
  const materials = useDb((db) => db.materials)
  // Recompute whenever any stock txn changes.
  const stampKey = useDb(
    (db) => db.receipts.length + db.issues.length + db.adjustments.length,
  )
  const companyName = useCompanyName()

  const rows = useMemo(() => {
    const db = getDb()
    return materials.map((m) => {
      const overall = materialStock(db, m.id)
      // per-company breakdown
      const companyIds = new Set<string>()
      db.receipts.filter((r) => r.materialId === m.id && r.companyId).forEach((r) => companyIds.add(r.companyId!))
      db.issues.filter((i) => i.materialId === m.id && i.companyId).forEach((i) => companyIds.add(i.companyId!))
      const perCompany = [...companyIds].map((cid) => ({
        companyId: cid,
        balance: materialStock(db, m.id, cid).balance,
      }))
      return {
        material: m,
        overall,
        value: materialStockValue(db, m.id),
        perCompany,
        low: m.reorderLevel !== undefined && overall.balance <= m.reorderLevel,
        negative: overall.balance < 0,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, stampKey])

  function exportCsv() {
    downloadCsv('stock-balance', rows, [
      { header: 'Material', value: (r) => r.material.name },
      { header: 'Code', value: (r) => r.material.code },
      { header: 'Unit', value: (r) => r.material.unit },
      { header: 'Received', value: (r) => r.overall.received },
      { header: 'Issued', value: (r) => r.overall.issued },
      { header: 'Adjusted', value: (r) => r.overall.adjusted },
      { header: 'Balance', value: (r) => r.overall.balance },
      { header: 'Value', value: (r) => r.value },
    ])
  }

  if (materials.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Boxes size={40} />}
          title="No materials yet"
          description="Add materials in the Materials tab, then receive stock."
        />
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex justify-end p-2">
        <button className="btn-secondary btn-sm" onClick={exportCsv}>
          <Download size={14} /> CSV
        </button>
      </div>
      <ResponsiveTable>
        <thead>
          <tr className="border-b border-slate-100">
            <th className="th">Material</th>
            <th className="th text-right">Received</th>
            <th className="th text-right">Issued</th>
            <th className="th text-right">Adjusted</th>
            <th className="th text-right">Balance</th>
            <th className="th text-right">Value</th>
            <th className="th">Company-wise</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r) => (
            <tr key={r.material.id} className="hover:bg-slate-50/60">
              <td className="td">
                <div className="font-semibold text-slate-800">{r.material.name}</div>
                <div className="text-2xs text-slate-400">
                  {r.material.code} · {r.material.unit}
                  {r.material.type ? ` · ${r.material.type}` : ''}
                </div>
              </td>
              <td className="td text-right">{qty(r.overall.received)}</td>
              <td className="td text-right">{qty(r.overall.issued)}</td>
              <td className="td text-right">{qty(r.overall.adjusted)}</td>
              <td className="td text-right">
                <span
                  className={clsx(
                    'font-semibold',
                    r.negative ? 'text-red-600' : r.low ? 'text-amber-600' : 'text-slate-800',
                  )}
                >
                  {qty(r.overall.balance)}
                </span>
                {r.negative ? (
                  <div className="text-2xs font-semibold text-red-500">negative!</div>
                ) : r.low ? (
                  <div className="text-2xs font-semibold text-amber-500">low stock</div>
                ) : null}
              </td>
              <td className="td text-right">{currency(r.value)}</td>
              <td className="td">
                <div className="flex flex-wrap gap-1">
                  {r.perCompany.length === 0 && <span className="text-2xs text-slate-300">—</span>}
                  {r.perCompany.map((pc) => (
                    <Badge key={pc.companyId} tone={pc.balance < 0 ? 'red' : 'slate'}>
                      {companyName(pc.companyId)}: {qty(pc.balance)}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </ResponsiveTable>
    </Card>
  )
}

// --------------------------------------------------------------- Materials tab
function MaterialsTab({
  onAdd,
  onEdit,
}: {
  onAdd: () => void
  onEdit: (m: Material) => void
}) {
  const materials = useDb((db) => db.materials)
  const toast = useToast()
  const confirm = useConfirm()

  async function onDelete(m: Material) {
    const ok = await confirm({
      title: 'Delete material',
      message: `Delete "${m.name}"?`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      materialRepo.remove(m.id)
      toast.success('Material deleted')
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Delete failed')
    }
  }

  return (
    <Card>
      <div className="flex justify-end p-2">
        <button className="btn-primary btn-sm" onClick={onAdd}>
          <Plus size={14} /> Add Material
        </button>
      </div>
      {materials.length === 0 ? (
        <EmptyState icon={<Boxes size={40} />} title="No materials defined" />
      ) : (
        <ResponsiveTable>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">Code</th>
              <th className="th">Name</th>
              <th className="th">Type</th>
              <th className="th">Unit</th>
              <th className="th text-right">Def. Rate</th>
              <th className="th text-right">Reorder</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {materials.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50/60">
                <td className="td font-mono text-xs text-slate-500">{m.code}</td>
                <td className="td font-semibold text-slate-800">{m.name}</td>
                <td className="td">{m.type || '—'}</td>
                <td className="td">{m.unit}</td>
                <td className="td text-right">{m.defaultRate ? currency(m.defaultRate) : '—'}</td>
                <td className="td text-right">{m.reorderLevel ?? '—'}</td>
                <td className="td">
                  {m.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}
                </td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <button className="btn-ghost btn-sm" onClick={() => onEdit(m)}>
                      <Pencil size={15} />
                    </button>
                    <button className="btn-ghost btn-sm text-red-500" onClick={() => onDelete(m)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- Receipts tab
function ReceiptsTab() {
  const receipts = useDb((db) => db.receipts)
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const confirm = useConfirm()
  const toast = useToast()

  async function del(id: string) {
    const ok = await confirm({ message: 'Delete this receipt? Stock will be reduced.', danger: true })
    if (!ok) return
    stockRepo.removeReceipt(id)
    toast.success('Receipt deleted')
  }

  return (
    <Card>
      {receipts.length === 0 ? (
        <EmptyState icon={<ArrowDownToLine size={40} />} title="No receipts recorded" />
      ) : (
        <ResponsiveTable>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">Receipt</th>
              <th className="th">Date</th>
              <th className="th">Material</th>
              <th className="th">Owner</th>
              <th className="th">Supplier</th>
              <th className="th text-right">Qty</th>
              <th className="th text-right">Rate</th>
              <th className="th">Batch</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {receipts.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="td font-mono text-xs text-slate-500">{r.receiptNo}</td>
                <td className="td">{fmtDate(r.date)}</td>
                <td className="td font-medium">{materialName(r.materialId)}</td>
                <td className="td">
                  {r.ownerType === 'Shop' ? <Badge tone="slate">Shop</Badge> : companyName(r.companyId)}
                </td>
                <td className="td">{r.supplier || '—'}</td>
                <td className="td text-right font-semibold">
                  {qty(r.quantity)} {r.unit}
                </td>
                <td className="td text-right">{r.rate ? currency(r.rate) : '—'}</td>
                <td className="td">{r.batchNo || '—'}</td>
                <td className="td text-right">
                  <button className="btn-ghost btn-sm text-red-500" onClick={() => del(r.id)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ Issues tab
function IssuesTab() {
  const issues = useDb((db) => db.issues)
  const materialName = useMaterialName()
  const jobNo = useJobNo()
  const companyName = useCompanyName()
  const confirm = useConfirm()
  const toast = useToast()

  async function del(id: string) {
    const ok = await confirm({ message: 'Delete this issue? Stock will be restored.', danger: true })
    if (!ok) return
    stockRepo.removeIssue(id)
    toast.success('Issue deleted')
  }

  return (
    <Card>
      {issues.length === 0 ? (
        <EmptyState icon={<ArrowUpFromLine size={40} />} title="No issues recorded" />
      ) : (
        <ResponsiveTable>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">Issue</th>
              <th className="th">Date</th>
              <th className="th">Material</th>
              <th className="th">Job</th>
              <th className="th">Company</th>
              <th className="th text-right">Qty</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {issues.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50/60">
                <td className="td font-mono text-xs text-slate-500">{i.issueNo}</td>
                <td className="td">{fmtDate(i.date)}</td>
                <td className="td font-medium">{materialName(i.materialId)}</td>
                <td className="td font-mono text-xs">{jobNo(i.jobId)}</td>
                <td className="td">{companyName(i.companyId)}</td>
                <td className="td text-right font-semibold">
                  {qty(i.quantity)} {i.unit}
                </td>
                <td className="td text-right">
                  <button className="btn-ghost btn-sm text-red-500" onClick={() => del(i.id)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}
    </Card>
  )
}

// ------------------------------------------------------------- Adjustments tab
function AdjustmentsTab() {
  const adjustments = useDb((db) => db.adjustments)
  const materialName = useMaterialName()
  const companyName = useCompanyName()

  return (
    <Card>
      {adjustments.length === 0 ? (
        <EmptyState icon={<Sliders size={40} />} title="No adjustments recorded" />
      ) : (
        <ResponsiveTable>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">Adj No</th>
              <th className="th">Date</th>
              <th className="th">Material</th>
              <th className="th">Scope</th>
              <th className="th text-right">Change</th>
              <th className="th">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {adjustments.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/60">
                <td className="td font-mono text-xs text-slate-500">{a.adjNo}</td>
                <td className="td">{fmtDate(a.date)}</td>
                <td className="td font-medium">{materialName(a.materialId)}</td>
                <td className="td">{a.companyId ? companyName(a.companyId) : 'Overall'}</td>
                <td className="td text-right">
                  <span className={a.quantity < 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-600'}>
                    {a.quantity > 0 ? '+' : ''}
                    {qty(a.quantity)} {a.unit}
                  </span>
                </td>
                <td className="td max-w-xs whitespace-normal text-slate-500">{a.reason}</td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}
    </Card>
  )
}
