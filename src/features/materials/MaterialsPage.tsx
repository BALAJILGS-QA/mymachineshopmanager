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
import {
  useDeleteMaterial,
  useRemoveReceipt,
  useRemoveIssue,
  useMaterials,
  useReceipts,
  useIssues,
  useAdjustments,
} from './hooks/useMaterials'
import { useChallans } from '@/features/deliveries/hooks/useDeliveries'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { toUserMessage } from '@/lib/api/errors'
import { materialStock, materialStockValue, SHOP_SCOPE, type StockDb } from '@/data/computations'
import { currency, fmtDate, qty } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName, useJobNo, useMaterialName } from '@/features/shared/lookups'
import { AdjustmentForm, IssueForm, MaterialForm, ReceiptForm } from './MaterialForms'

type Tab = 'stock' | 'ledger' | 'materials' | 'receipts' | 'issues' | 'adjustments'
type Dialog = 'material' | 'receipt' | 'issue' | 'adjustment' | null

const TABS: { key: Tab; label: string }[] = [
  { key: 'stock', label: 'Stock Balance' },
  { key: 'ledger', label: 'Company Ledger' },
  { key: 'materials', label: 'Materials' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'issues', label: 'Issues' },
  { key: 'adjustments', label: 'Adjustments' },
]

// Owner-scope match: '' = all, SHOP_SCOPE = own (shop, companyId null),
// else a specific customer companyId.
export function ownerMatch(rowCompanyId: string | undefined, filter: string): boolean {
  if (!filter) return true
  if (filter === SHOP_SCOPE) return rowCompanyId == null
  return rowCompanyId === filter
}

// The collections the stock derivations read, assembled from Supabase queries.
function useStockData() {
  const { data: materials = [] } = useMaterials()
  const { data: receipts = [] } = useReceipts()
  const { data: issues = [] } = useIssues()
  const { data: adjustments = [] } = useAdjustments()
  const db: StockDb = { materials, receipts, issues, adjustments }
  return { materials, receipts, issues, adjustments, db }
}

export function MaterialsPage() {
  const [tab, setTab] = useState<Tab>('stock')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [editMaterial, setEditMaterial] = useState<Material | null>(null)
  const [fCompany, setFCompany] = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const { data: companies = [] } = useCompanies()
  const { data: materials = [] } = useMaterials()

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
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Company + material filters — show all records for the selection. */}
      {tab !== 'materials' && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <div>
            <label className="label">Company</label>
            <select
              className="input min-w-[11rem]"
              value={fCompany}
              onChange={(e) => setFCompany(e.target.value)}
            >
              <option value="">All (own + customers)</option>
              <option value={SHOP_SCOPE}>Own material (shop)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Material</label>
            <select
              className="input min-w-[12rem]"
              value={fMaterial}
              onChange={(e) => setFMaterial(e.target.value)}
            >
              <option value="">All materials</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          {(fCompany || fMaterial) && (
            <button
              className="btn-ghost btn-sm mb-0.5"
              onClick={() => {
                setFCompany('')
                setFMaterial('')
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {tab === 'stock' && <StockTab fCompany={fCompany} fMaterial={fMaterial} />}
      {tab === 'ledger' && <LedgerTab fCompany={fCompany} fMaterial={fMaterial} />}
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
      {tab === 'receipts' && <ReceiptsTab fCompany={fCompany} fMaterial={fMaterial} />}
      {tab === 'issues' && <IssuesTab fCompany={fCompany} fMaterial={fMaterial} />}
      {tab === 'adjustments' && <AdjustmentsTab fCompany={fCompany} fMaterial={fMaterial} />}

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
function StockTab({ fCompany, fMaterial }: { fCompany: string; fMaterial: string }) {
  const { materials: materialsAll, receipts, issues, adjustments, db } = useStockData()
  // Recompute whenever any stock txn changes.
  const stampKey = receipts.length + issues.length + adjustments.length
  const companyName = useCompanyName()

  const rows = useMemo(() => {
    const materials = fMaterial ? materialsAll.filter((m) => m.id === fMaterial) : materialsAll
    return materials.map((m) => {
      const overall = materialStock(db, m.id)
      const ownBalance = materialStock(db, m.id, SHOP_SCOPE).balance
      // per-company breakdown
      const companyIds = new Set<string>()
      db.receipts
        .filter((r) => r.materialId === m.id && r.companyId)
        .forEach((r) => companyIds.add(r.companyId!))
      db.issues
        .filter((i) => i.materialId === m.id && i.companyId)
        .forEach((i) => companyIds.add(i.companyId!))
      let perCompany = [...companyIds].map((cid) => ({
        companyId: cid,
        balance: materialStock(db, m.id, cid).balance,
      }))
      // Company filter narrows the breakdown to the chosen scope.
      if (fCompany && fCompany !== SHOP_SCOPE)
        perCompany = perCompany.filter((pc) => pc.companyId === fCompany)
      return {
        material: m,
        overall,
        ownBalance,
        value: materialStockValue(db, m.id),
        perCompany,
        showOwn: !fCompany || fCompany === SHOP_SCOPE,
        low: m.reorderLevel !== undefined && overall.balance <= m.reorderLevel,
        negative: overall.balance < 0,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialsAll, stampKey, fCompany, fMaterial])

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

  if (materialsAll.length === 0) {
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
                <div className="text-2xs text-slate-500">
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
                  {r.showOwn && (
                    <Badge tone={r.ownBalance < 0 ? 'red' : 'green'}>
                      Own (shop): {qty(r.ownBalance)}
                    </Badge>
                  )}
                  {r.perCompany.map((pc) => (
                    <Badge key={pc.companyId} tone={pc.balance < 0 ? 'red' : 'blue'}>
                      {companyName(pc.companyId)}: {qty(pc.balance)}
                    </Badge>
                  ))}
                  {!r.showOwn && r.perCompany.length === 0 && (
                    <span className="text-2xs text-slate-400">—</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </ResponsiveTable>
    </Card>
  )
}

// -------------------------------------------------------------- Company ledger
// Business date for the day, plus the recorded (created) time.
function whenText(dateOnly: string, createdAt?: string): string {
  const day = fmtDate(dateOnly)
  const c = createdAt ? new Date(createdAt) : null
  if (!c || isNaN(c.getTime())) return day
  const hh = String(c.getHours()).padStart(2, '0')
  const mi = String(c.getMinutes()).padStart(2, '0')
  return `${day}, ${hh}:${mi}`
}
function whenSort(dateOnly: string, createdAt?: string): number {
  const c = createdAt ? new Date(createdAt).getTime() : NaN
  return isNaN(c) ? new Date(dateOnly).getTime() : c
}

const DC_TONE: Record<string, string> = { Open: 'amber', Invoiced: 'green', Cancelled: 'red' }

function LedgerTab({ fCompany, fMaterial }: { fCompany: string; fMaterial: string }) {
  const { data: receipts = [] } = useReceipts()
  const { data: issues = [] } = useIssues()
  const { data: adjustments = [] } = useAdjustments()
  const { data: challans = [] } = useChallans()
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const jobNo = useJobNo()

  type Row = {
    ts: number
    when: string
    type: string
    tone: string
    ref: string
    item: string
    qty: string
    detail: string
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const matOk = (materialId: string) => !fMaterial || materialId === fMaterial

    for (const r of receipts) {
      if (!ownerMatch(r.companyId, fCompany) || !matOk(r.materialId)) continue
      out.push({
        ts: whenSort(r.date, r.createdAt),
        when: whenText(r.date, r.createdAt),
        type: 'Received',
        tone: 'green',
        ref: r.receiptNo,
        item: materialName(r.materialId),
        qty: `+${qty(r.quantity)} ${r.unit}`,
        detail: `${r.ownerType === 'Shop' ? 'Own (shop)' : companyName(r.companyId)}${r.supplier ? ` · from ${r.supplier}` : ''}`,
      })
    }
    for (const i of issues) {
      if (!ownerMatch(i.companyId, fCompany) || !matOk(i.materialId)) continue
      out.push({
        ts: whenSort(i.date, i.createdAt),
        when: whenText(i.date, i.createdAt),
        type: 'Issued',
        tone: 'blue',
        ref: i.issueNo,
        item: materialName(i.materialId),
        qty: `-${qty(i.quantity)} ${i.unit}`,
        detail: `${i.companyId ? companyName(i.companyId) : 'Own (shop)'} · Job ${jobNo(i.jobId)}`,
      })
    }
    for (const a of adjustments) {
      if (!ownerMatch(a.companyId, fCompany) || !matOk(a.materialId)) continue
      out.push({
        ts: whenSort(a.date, a.createdAt),
        when: whenText(a.date, a.createdAt),
        type: 'Adjusted',
        tone: 'violet',
        ref: a.adjNo,
        item: materialName(a.materialId),
        qty: `${a.quantity > 0 ? '+' : ''}${qty(a.quantity)} ${a.unit}`,
        detail: a.reason,
      })
    }
    // Dispatches (delivery challans). No material master link, so only when the
    // material filter is off. Shown for every status (partial/fully delivered).
    if (!fMaterial) {
      for (const d of challans) {
        if (!ownerMatch(d.companyId, fCompany)) continue
        const totalQty = d.lines.reduce((s, l) => s + l.quantity, 0)
        out.push({
          ts: whenSort(d.date, d.createdAt),
          when: whenText(d.date, d.createdAt),
          type: 'Dispatched',
          tone: DC_TONE[d.status] ?? 'slate',
          ref: d.dcNo,
          item: d.lines.map((l) => `${l.description} ×${qty(l.quantity)}`).join(', ') || '—',
          qty: totalQty ? `${qty(totalQty)}` : '—',
          detail: `${companyName(d.companyId)} · ${d.status}${d.vehicleNo ? ` · ${d.vehicleNo}` : ''}`,
        })
      }
    }

    return out.sort((a, b) => b.ts - a.ts)
  }, [
    receipts,
    issues,
    adjustments,
    challans,
    fCompany,
    fMaterial,
    materialName,
    companyName,
    jobNo,
  ])

  const pg = usePagination(rows)

  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Boxes size={40} />}
          title="No records for this selection"
          description="Receipts, issues, adjustments and dispatches appear here once recorded."
        />
      ) : (
        <ResponsiveTable>
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">Date &amp; Time</th>
              <th className="th">Type</th>
              <th className="th">Reference</th>
              <th className="th">Material / Items</th>
              <th className="th text-right">Qty</th>
              <th className="th">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pg.pageItems.map((r, idx) => (
              <tr key={`${r.ref}-${idx}`} className="hover:bg-slate-50/60">
                <td className="td whitespace-nowrap">{r.when}</td>
                <td className="td">
                  <Badge tone={r.tone}>{r.type}</Badge>
                </td>
                <td className="td font-mono text-xs text-slate-500">{r.ref}</td>
                <td className="td max-w-xs whitespace-normal font-medium">{r.item}</td>
                <td className="td text-right font-semibold">{r.qty}</td>
                <td className="td max-w-xs whitespace-normal text-slate-600">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}
      <Pagination pg={pg} />
    </Card>
  )
}

// --------------------------------------------------------------- Materials tab
function MaterialsTab({ onAdd, onEdit }: { onAdd: () => void; onEdit: (m: Material) => void }) {
  const { data: materials = [] } = useMaterials()
  const deleteMaterial = useDeleteMaterial()
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
      await deleteMaterial.mutateAsync(m.id)
      toast.success('Material deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
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
                  {m.active ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge tone="gray">Inactive</Badge>
                  )}
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
function ReceiptsTab({ fCompany, fMaterial }: { fCompany: string; fMaterial: string }) {
  const { data: allReceipts = [] } = useReceipts()
  const receipts = useMemo(
    () =>
      allReceipts.filter(
        (r) => ownerMatch(r.companyId, fCompany) && (!fMaterial || r.materialId === fMaterial),
      ),
    [allReceipts, fCompany, fMaterial],
  )
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const removeReceipt = useRemoveReceipt()
  const confirm = useConfirm()
  const toast = useToast()
  const pg = usePagination(receipts)

  async function del(id: string) {
    const ok = await confirm({
      message: 'Delete this receipt? Stock will be reduced.',
      danger: true,
    })
    if (!ok) return
    try {
      await removeReceipt.mutateAsync(id)
      toast.success('Receipt deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
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
            {pg.pageItems.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="td font-mono text-xs text-slate-500">{r.receiptNo}</td>
                <td className="td">{fmtDate(r.date)}</td>
                <td className="td font-medium">{materialName(r.materialId)}</td>
                <td className="td">
                  {r.ownerType === 'Shop' ? (
                    <Badge tone="slate">Shop</Badge>
                  ) : (
                    companyName(r.companyId)
                  )}
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
      <Pagination pg={pg} />
    </Card>
  )
}

// ------------------------------------------------------------------ Issues tab
function IssuesTab({ fCompany, fMaterial }: { fCompany: string; fMaterial: string }) {
  const { data: allIssues = [] } = useIssues()
  const issues = useMemo(
    () =>
      allIssues.filter(
        (i) => ownerMatch(i.companyId, fCompany) && (!fMaterial || i.materialId === fMaterial),
      ),
    [allIssues, fCompany, fMaterial],
  )
  const materialName = useMaterialName()
  const jobNo = useJobNo()
  const companyName = useCompanyName()
  const removeIssue = useRemoveIssue()
  const confirm = useConfirm()
  const toast = useToast()
  const pg = usePagination(issues)

  async function del(id: string) {
    const ok = await confirm({
      message: 'Delete this issue? Stock will be restored.',
      danger: true,
    })
    if (!ok) return
    try {
      await removeIssue.mutateAsync(id)
      toast.success('Issue deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
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
            {pg.pageItems.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50/60">
                <td className="td font-mono text-xs text-slate-500">{i.issueNo}</td>
                <td className="td">{fmtDate(i.date)}</td>
                <td className="td font-medium">{materialName(i.materialId)}</td>
                <td className="td font-mono text-xs">{jobNo(i.jobId)}</td>
                <td className="td">
                  {i.companyId ? companyName(i.companyId) : <Badge tone="green">Own (shop)</Badge>}
                </td>
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
      <Pagination pg={pg} />
    </Card>
  )
}

// ------------------------------------------------------------- Adjustments tab
function AdjustmentsTab({ fCompany, fMaterial }: { fCompany: string; fMaterial: string }) {
  const { data: allAdjustments = [] } = useAdjustments()
  const adjustments = useMemo(
    () =>
      allAdjustments.filter(
        (a) => ownerMatch(a.companyId, fCompany) && (!fMaterial || a.materialId === fMaterial),
      ),
    [allAdjustments, fCompany, fMaterial],
  )
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const pg = usePagination(adjustments)

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
            {pg.pageItems.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/60">
                <td className="td font-mono text-xs text-slate-500">{a.adjNo}</td>
                <td className="td">{fmtDate(a.date)}</td>
                <td className="td font-medium">{materialName(a.materialId)}</td>
                <td className="td">{a.companyId ? companyName(a.companyId) : 'Overall'}</td>
                <td className="td text-right">
                  <span
                    className={
                      a.quantity < 0
                        ? 'font-semibold text-red-600'
                        : 'font-semibold text-emerald-600'
                    }
                  >
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
      <Pagination pg={pg} />
    </Card>
  )
}
