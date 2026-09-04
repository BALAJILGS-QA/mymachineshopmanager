import { useMemo, useState } from 'react'
import { ArrowLeftRight, Plus } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate, todayISO } from '@/lib/format'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { useMaterials, useStockTransfers } from '../hooks/useInventory'
import type { StockTransfer, StockTransferStatus } from '../types'

const STATUS_TONE: Record<StockTransferStatus, string> = {
  draft: 'slate',
  requested: 'blue',
  approved: 'violet',
  in_transit: 'amber',
  completed: 'green',
  cancelled: 'red',
}
const STATUS_LABEL: Record<StockTransferStatus, string> = {
  draft: 'Draft',
  requested: 'Requested',
  approved: 'Approved',
  in_transit: 'In Transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
// Allowed forward transition from each status (the "advance" action).
const NEXT: Partial<Record<StockTransferStatus, StockTransferStatus>> = {
  draft: 'requested',
  requested: 'approved',
  approved: 'in_transit',
  in_transit: 'completed',
}

const LOCATIONS = [
  'Main Store',
  'Warehouse',
  'Tool Room',
  'Production',
  'Machine Shop',
  'Quality',
  'Scrap Yard',
]

export function StockTransfersPage() {
  const { list, create, update, remove } = useStockTransfers()
  const { data: materials = [] } = useMaterials()
  const { data: companies = [] } = useCompanies()
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const canTransfer = usePermissions().can('INVENTORY_TRANSFER')
  const toast = useToast()
  const confirm = useConfirm()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<StockTransfer | null>(null)
  const [draft, setDraft] = useState<Partial<StockTransfer>>({})
  const [saving, setSaving] = useState(false)

  const rows = useMemo(
    () => [...(list.data ?? [])].sort((a, b) => (a.transferDate < b.transferDate ? 1 : -1)),
    [list.data],
  )
  const pg = usePagination(rows)

  function openCreate() {
    setEditing(null)
    setDraft({
      transferDate: todayISO(),
      fromLocation: 'Main Store',
      toLocation: 'Production',
      status: 'draft',
      quantity: 1,
    })
    setOpen(true)
  }
  function openEdit(t: StockTransfer) {
    setEditing(t)
    setDraft({ ...t })
    setOpen(true)
  }
  const set = (p: Partial<StockTransfer>) => setDraft((d) => ({ ...d, ...p }))

  async function save() {
    if (!draft.materialId) return toast.error('Select a material')
    if (!draft.fromLocation || !draft.toLocation)
      return toast.error('From and To locations are required')
    if (draft.fromLocation === draft.toLocation) return toast.error('From and To must differ')
    if (!draft.quantity || draft.quantity <= 0)
      return toast.error('Quantity must be greater than zero')
    setSaving(true)
    try {
      const unit = materials.find((m) => m.id === draft.materialId)?.unit
      if (editing) await update.mutateAsync({ id: editing.id, patch: { ...draft, unit } })
      else await create.mutateAsync({ ...draft, unit })
      toast.success(editing ? 'Transfer updated' : 'Transfer created')
      setOpen(false)
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function advance(t: StockTransfer) {
    const next = NEXT[t.status ?? 'draft']
    if (!next) return
    try {
      await update.mutateAsync({ id: t.id, patch: { status: next } })
      toast.success(`Marked ${STATUS_LABEL[next]}`)
    } catch (e) {
      toast.error(toUserMessage(e, 'Update failed'))
    }
  }
  async function cancel(t: StockTransfer) {
    const ok = await confirm({
      title: 'Cancel transfer',
      message: `Cancel transfer ${t.transferNo}?`,
      danger: true,
      confirmLabel: 'Cancel transfer',
    })
    if (!ok) return
    try {
      await update.mutateAsync({ id: t.id, patch: { status: 'cancelled' } })
      toast.success('Cancelled')
    } catch (e) {
      toast.error(toUserMessage(e, 'Update failed'))
    }
  }
  async function del(t: StockTransfer) {
    const ok = await confirm({
      title: 'Delete transfer',
      message: `Delete transfer ${t.transferNo}? This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await remove.mutateAsync(t.id)
      toast.success('Deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  const columns: DataTableColumn<StockTransfer>[] = [
    {
      key: 'no',
      header: 'Transfer',
      cellClassName: 'font-mono text-xs',
      render: (t) => t.transferNo || '—',
    },
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'whitespace-nowrap text-slate-600',
      render: (t) => fmtDate(t.transferDate),
    },
    {
      key: 'mat',
      header: 'Material',
      cellClassName: 'font-medium',
      render: (t) => materialName(t.materialId),
    },
    { key: 'move', header: 'From → To', render: (t) => `${t.fromLocation} → ${t.toLocation}` },
    {
      key: 'qty',
      header: 'Qty',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (t) => `${t.quantity} ${t.unit ?? ''}`,
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (t) => (t.companyId ? companyName(t.companyId) : 'Own / Shop'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <Badge tone={STATUS_TONE[t.status ?? 'draft']}>{STATUS_LABEL[t.status ?? 'draft']}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (t) => {
        if (!canTransfer) return null
        const st = t.status ?? 'draft'
        const next = NEXT[st]
        const closed = st === 'completed' || st === 'cancelled'
        return (
          <div className="flex justify-end gap-1">
            {next && (
              <button className="btn-ghost btn-sm text-brand-700" onClick={() => advance(t)}>
                {STATUS_LABEL[next]}
              </button>
            )}
            {!closed && (
              <button className="btn-ghost btn-sm" onClick={() => openEdit(t)}>
                Edit
              </button>
            )}
            {!closed && (
              <button className="btn-ghost btn-sm text-red-500" onClick={() => cancel(t)}>
                Cancel
              </button>
            )}
            {st === 'draft' && (
              <button className="btn-ghost btn-sm text-red-500" onClick={() => del(t)}>
                Delete
              </button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Stock Transfers"
        subtitle="Move materials between stores, warehouses, tool room and production areas"
        actions={
          canTransfer ? (
            <button className="btn-primary btn-sm" onClick={openCreate}>
              <Plus size={16} /> New Transfer
            </button>
          ) : undefined
        }
      />

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(t) => t.id}
          loading={list.isLoading}
          minWidthClassName="min-w-[60rem]"
          empty={{
            icon: <ArrowLeftRight size={40} />,
            title: 'No transfers',
            description: 'Create a transfer to move stock between locations.',
          }}
        />
        <Pagination pg={pg} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit transfer — ${editing.transferNo}` : 'New Stock Transfer'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Material" required className="sm:col-span-2">
            <Select
              value={draft.materialId ?? ''}
              onChange={(e) => set({ materialId: e.target.value })}
            >
              <option value="">Select a material…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code ? `${m.code} · ` : ''}
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From location" required>
            <Select
              value={draft.fromLocation ?? ''}
              onChange={(e) => set({ fromLocation: e.target.value })}
            >
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To location" required>
            <Select
              value={draft.toLocation ?? ''}
              onChange={(e) => set({ toLocation: e.target.value })}
            >
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity" required>
            <Input
              type="number"
              min={0}
              step="any"
              value={String(draft.quantity ?? '')}
              onChange={(e) => set({ quantity: Number(e.target.value) })}
            />
          </Field>
          <Field label="Transfer date">
            <Input
              type="date"
              value={draft.transferDate ?? ''}
              onChange={(e) => set({ transferDate: e.target.value })}
            />
          </Field>
          <Field label="Owner scope">
            <Select
              value={draft.companyId ?? ''}
              onChange={(e) => set({ companyId: e.target.value || undefined })}
            >
              <option value="">Own / Shop</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Requested by">
            <Input
              value={draft.requestedBy ?? ''}
              onChange={(e) => set({ requestedBy: e.target.value })}
            />
          </Field>
          {editing && (
            <Field label="Status">
              <Select
                value={draft.status ?? 'draft'}
                onChange={(e) => set({ status: e.target.value as StockTransferStatus })}
              >
                {(Object.keys(STATUS_LABEL) as StockTransferStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Approved by">
            <Input
              value={draft.approvedBy ?? ''}
              onChange={(e) => set({ approvedBy: e.target.value })}
            />
          </Field>
          <Field label="Remarks" className="sm:col-span-2">
            <Textarea
              value={draft.remarks ?? ''}
              onChange={(e) => set({ remarks: e.target.value })}
              rows={2}
            />
          </Field>
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-2xs text-slate-500">
          Material stock is owner-scoped (Own / per-customer), not location-scoped, so an internal
          location transfer is tracked as a document here and does not change on-hand balances.
        </p>
      </Modal>
    </div>
  )
}
