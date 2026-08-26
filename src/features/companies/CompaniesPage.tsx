import { useMemo, useState } from 'react'
import { Building2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { Company } from '@/types'
import {
  useCompanies,
  useCreateCompany,
  useUpdateCompany,
  useDeleteCompany,
} from './hooks/useCompanies'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { toUserMessage } from '@/lib/api/errors'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState, Field, Input, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export function CompaniesPage() {
  const { data: companies = [], isLoading } = useCompanies()
  const { data: jobs = [] } = useJobs()
  const { data: invoices = [] } = useInvoices()
  const deleteCompany = useDeleteCompany()
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Company | null | undefined>(undefined)

  const filtered = useMemo(
    () =>
      companies.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.toLowerCase().includes(search.toLowerCase()),
      ),
    [companies, search],
  )

  const pg = usePagination(filtered)

  const txnCount = (id: string) =>
    jobs.filter((j) => j.companyId === id).length +
    invoices.filter((i) => i.companyId === id).length

  async function onDelete(c: Company) {
    const ok = await confirm({
      title: 'Delete company',
      message: `Delete "${c.name}"? This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteCompany.mutateAsync(c.id)
      toast.success('Company deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle="Customers and material owners"
        actions={
          <button className="btn-primary" onClick={() => setEditing(null)}>
            <Plus size={16} /> Add Company
          </button>
        }
      />

      <Card className="mb-3 p-3">
        <div className="relative max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            className="pl-9"
            placeholder="Search name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading companies…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 size={40} />}
            title="No companies found"
            description="Add your first customer/company to start creating job orders."
          />
        ) : (
          <ResponsiveTable>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Code</th>
                <th className="th">Name</th>
                <th className="th">Contact</th>
                <th className="th">Phone</th>
                <th className="th">GSTIN</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pg.pageItems.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono text-xs text-slate-500">{c.code}</td>
                  <td className="td font-semibold text-slate-800">{c.name}</td>
                  <td className="td">{c.contactPerson || '—'}</td>
                  <td className="td">{c.phone || '—'}</td>
                  <td className="td">{c.gstin || '—'}</td>
                  <td className="td">
                    {c.active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="gray">Inactive</Badge>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setEditing(c)}
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn-ghost btn-sm text-red-500"
                        onClick={() => onDelete(c)}
                        title={txnCount(c.id) ? 'Has transactions' : 'Delete'}
                      >
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
        <CompanyForm company={editing} onClose={() => setEditing(undefined)} />
      )}
    </div>
  )
}

function CompanyForm({ company, onClose }: { company: Company | null; onClose: () => void }) {
  const toast = useToast()
  const createCompany = useCreateCompany()
  const updateCompany = useUpdateCompany()
  const saving = createCompany.isPending || updateCompany.isPending
  const [form, setForm] = useState({
    name: company?.name ?? '',
    code: company?.code ?? '',
    contactPerson: company?.contactPerson ?? '',
    phone: company?.phone ?? '',
    email: company?.email ?? '',
    billingAddress: company?.billingAddress ?? '',
    gstin: company?.gstin ?? '',
    notes: company?.notes ?? '',
    active: company?.active ?? true,
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    try {
      if (company) {
        await updateCompany.mutateAsync({ id: company.id, patch: form })
        toast.success('Company updated')
      } else {
        await createCompany.mutateAsync(form)
        toast.success('Company created')
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
      title={company ? 'Edit Company' : 'Add Company'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : company ? 'Save changes' : 'Create company'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Company Name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Customer Code" hint="Leave blank to auto-generate">
          <Input value={form.code} onChange={(e) => set('code', e.target.value)} />
        </Field>
        <Field label="Contact Person">
          <Input
            value={form.contactPerson}
            onChange={(e) => set('contactPerson', e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="GST / Tax ID">
          <Input value={form.gstin} onChange={(e) => set('gstin', e.target.value)} />
        </Field>
        <Field label="Status">
          <label className="flex items-center gap-2 py-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Active
          </label>
        </Field>
        <Field label="Billing Address" className="sm:col-span-2">
          <Textarea
            rows={2}
            value={form.billingAddress}
            onChange={(e) => set('billingAddress', e.target.value)}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
