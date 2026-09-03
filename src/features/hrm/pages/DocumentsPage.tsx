import { FileText } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import { useEmployeeDocuments, useEmployees } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import { employeeName } from '../components/employeeUi'
import type { EmployeeDocument } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { fmtDate, todayISO } from '@/lib/format'

export function DocumentsPage() {
  const { list, create, update, remove } = useEmployeeDocuments()
  const employees = useEmployees().data ?? []
  const perms = usePermissions()
  const canUpload = perms.can('DOCUMENT_UPLOAD')
  const canDelete = perms.can('DOCUMENT_DELETE')

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? employeeName(e) : id
  }
  const expiringSoon = (d: EmployeeDocument) => {
    if (!d.expiryDate) return false
    const days = (new Date(d.expiryDate).getTime() - Date.now()) / 86400000
    return days <= 30
  }

  const columns: DataTableColumn<EmployeeDocument>[] = [
    {
      key: 'emp',
      header: 'Employee',
      cellClassName: 'font-semibold',
      render: (d) => empName(d.employeeId),
    },
    { key: 'title', header: 'Document', render: (d) => d.title },
    {
      key: 'no',
      header: 'Number',
      cellClassName: 'font-mono text-xs',
      render: (d) => d.documentNo || '—',
    },
    {
      key: 'issue',
      header: 'Issued',
      cellClassName: 'text-xs',
      render: (d) => (d.issueDate ? fmtDate(d.issueDate) : '—'),
    },
    {
      key: 'expiry',
      header: 'Expiry',
      cellClassName: 'text-xs',
      render: (d) =>
        d.expiryDate ? (
          <span className={expiringSoon(d) ? 'font-semibold text-red-600' : ''}>
            {fmtDate(d.expiryDate)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => <Badge tone={d.status === 'active' ? 'green' : 'slate'}>{d.status}</Badge>,
    },
  ]

  return (
    <MasterManager<EmployeeDocument>
      title="Employee Documents"
      subtitle="Store ID proofs, contracts and certificates with expiry tracking"
      addLabel="Add Document"
      emptyIcon={<FileText size={40} />}
      emptyTitle="No documents"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canUpload}
      search={(d, q) =>
        d.title.toLowerCase().includes(q) || empName(d.employeeId).toLowerCase().includes(q)
      }
      emptyDraft={() => ({ title: '', status: 'active', issueDate: todayISO() })}
      toDraft={(d) => ({ ...d })}
      validate={(d) =>
        !d.employeeId ? 'Select an employee' : !String(d.title).trim() ? 'Title is required' : null
      }
      onCreate={(d) => create.mutateAsync(d as Partial<EmployeeDocument>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<EmployeeDocument> })}
      onDelete={canDelete ? (d) => remove.mutateAsync(d.id) : undefined}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Employee" required className="sm:col-span-2">
            <Select
              value={String(draft.employeeId ?? '')}
              onChange={(e) => patch({ employeeId: e.target.value })}
            >
              <option value="">— Select —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeName(e)} ({e.employeeCode})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" required>
            <Input
              value={String(draft.title ?? '')}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Offer Letter"
            />
          </Field>
          <Field label="Document number">
            <Input
              value={String(draft.documentNo ?? '')}
              onChange={(e) => patch({ documentNo: e.target.value })}
            />
          </Field>
          <Field label="Issue date">
            <Input
              type="date"
              value={String(draft.issueDate ?? '')}
              onChange={(e) => patch({ issueDate: e.target.value || undefined })}
            />
          </Field>
          <Field label="Expiry date">
            <Input
              type="date"
              value={String(draft.expiryDate ?? '')}
              onChange={(e) => patch({ expiryDate: e.target.value || undefined })}
            />
          </Field>
          <Field
            label="File reference (storage path)"
            className="sm:col-span-2"
            hint="Secure storage path — direct public URLs are not used for sensitive documents."
          >
            <Input
              value={String(draft.filePath ?? '')}
              onChange={(e) => patch({ filePath: e.target.value })}
            />
          </Field>
          <Field label="Remarks" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={String(draft.remarks ?? '')}
              onChange={(e) => patch({ remarks: e.target.value })}
            />
          </Field>
        </div>
      )}
    />
  )
}
