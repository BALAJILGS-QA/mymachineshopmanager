import { useMemo, useState } from 'react'
import { Building2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { Vendor } from '@/types'
import { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor } from './hooks/useVendors'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDateTime } from '@/lib/format'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState, Field, Input, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export function VendorsPage() {
  const { data: vendors = [], isLoading } = useVendors()
  const deleteVendor = useDeleteVendor()
  const toast = useToast()
  const confirm = useConfirm()

  const [editing, setEditing] = useState<Vendor | null | undefined>(undefined)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return vendors
      .filter((v) =>
        s
          ? `${v.code} ${v.name} ${v.gstin ?? ''} ${v.phone ?? ''}`.toLowerCase().includes(s)
          : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [vendors, search])

  const pg = usePagination(rows)

  async function del(v: Vendor) {
    const ok = await confirm({
      title: 'Delete vendor',
      message: `Delete "${v.name}"?`,
      danger: true,
    })
    if (!ok) return
    try {
      await deleteVendor.mutateAsync(v.id)
      toast.success('Vendor deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed — the vendor may be used by a subcontract.'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers and subcontractors used by purchases and job work"
        actions={
          <button className="btn-primary" onClick={() => setEditing(null)}>
            <Plus size={16} /> Add Vendor
          </button>
        }
      />

      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
            aria-label="Search vendors"
            placeholder="Search name, code, GSTIN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading vendors…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Building2 size={40} />}
            title="No vendors"
            description="Add a supplier or subcontractor to use in purchases and job work."
          />
        ) : (
          <ResponsiveTable>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Code</th>
                <th className="th">Name</th>
                <th className="th">GSTIN</th>
                <th className="th">Phone</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pg.pageItems.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono text-xs text-slate-500">{v.code}</td>
                  <td className="td font-medium text-slate-800">{v.name}</td>
                  <td className="td text-slate-600">{v.gstin || '—'}</td>
                  <td className="td text-slate-600">{v.phone || '—'}</td>
                  <td className="td">
                    {v.active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="gray">Inactive</Badge>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(v)}>
                        <Pencil size={15} />
                      </button>
                      <button className="btn-ghost btn-sm text-red-500" onClick={() => del(v)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
        <Pagination pg={pg} />
      </Card>

      {editing !== undefined && (
        <VendorForm vendor={editing} onClose={() => setEditing(undefined)} />
      )}
    </div>
  )
}

function VendorForm({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const toast = useToast()
  const createVendor = useCreateVendor()
  const updateVendor = useUpdateVendor()
  const saving = createVendor.isPending || updateVendor.isPending

  const [form, setForm] = useState({
    name: vendor?.name ?? '',
    gstin: vendor?.gstin ?? '',
    phone: vendor?.phone ?? '',
    email: vendor?.email ?? '',
    address: vendor?.address ?? '',
    active: vendor?.active ?? true,
    notes: vendor?.notes ?? '',
  })
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    if (!form.name.trim()) return toast.error('Vendor name is required')
    try {
      const payload = {
        name: form.name.trim(),
        gstin: form.gstin.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        active: form.active,
        notes: form.notes.trim() || undefined,
      }
      if (vendor) {
        await updateVendor.mutateAsync({ id: vendor.id, patch: payload })
        toast.success('Vendor updated')
      } else {
        await createVendor.mutateAsync(payload)
        toast.success('Vendor added')
      }
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={vendor ? `Edit ${vendor.code}` : 'Add Vendor'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : vendor ? 'Save changes' : 'Add vendor'}
          </button>
        </>
      }
    >
      {vendor && (
        <p className="mb-3 text-right text-2xs text-slate-500">
          Last updated {fmtDateTime(vendor.updatedAt)}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Vendor Name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="GSTIN">
          <Input value={form.gstin} onChange={(e) => set('gstin', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Status">
          <select
            className="input"
            value={form.active ? 'active' : 'inactive'}
            onChange={(e) => set('active', e.target.value === 'active')}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea
            rows={2}
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
