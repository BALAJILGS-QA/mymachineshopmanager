import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Card } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'

// Reusable list + modal-form manager for the many simple HRM masters
// (departments, designations, shifts, holidays, leave types, salary components,
// expense categories, training programs, assets…). A caller supplies the table
// columns, an empty/edit draft factory and the modal form body; this component
// owns search, pagination, the add/edit modal, save + delete with confirm and
// consistent toasts. Write controls are hidden unless `canWrite`.
export interface MasterManagerProps<T extends { id: string }> {
  title: string
  subtitle?: string
  emptyIcon?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  addLabel?: string
  rows: T[]
  loading?: boolean
  columns: DataTableColumn<T>[]
  search: (row: T, q: string) => boolean
  emptyDraft: () => Record<string, unknown>
  toDraft: (row: T) => Record<string, unknown>
  renderForm: (
    draft: Record<string, unknown>,
    patch: (p: Record<string, unknown>) => void,
  ) => ReactNode
  validate?: (draft: Record<string, unknown>) => string | null
  onCreate: (draft: Record<string, unknown>) => Promise<unknown>
  onUpdate: (id: string, draft: Record<string, unknown>) => Promise<unknown>
  onDelete?: (row: T) => Promise<unknown>
  canWrite?: boolean
  modalSize?: 'sm' | 'md' | 'lg' | 'xl'
  deleteLabel?: (row: T) => string
  headerActions?: ReactNode
}

export function MasterManager<T extends { id: string }>(props: MasterManagerProps<T>) {
  const {
    title,
    subtitle,
    emptyIcon,
    emptyTitle = 'Nothing here yet',
    emptyDescription,
    addLabel = 'Add',
    rows,
    loading,
    columns,
    search,
    emptyDraft,
    toDraft,
    renderForm,
    validate,
    onCreate,
    onUpdate,
    onDelete,
    canWrite = true,
    modalSize = 'md',
    deleteLabel,
    headerActions,
  } = props

  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? rows.filter((r) => search(r, s)) : rows
  }, [rows, q, search])
  const pg = usePagination(filtered)

  function openCreate() {
    setEditing(null)
    setDraft(emptyDraft())
    setOpen(true)
  }
  function openEdit(row: T) {
    setEditing(row)
    setDraft(toDraft(row))
    setOpen(true)
  }
  function patch(p: Record<string, unknown>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  async function save() {
    const err = validate?.(draft)
    if (err) {
      toast.error(err)
      return
    }
    setSaving(true)
    try {
      if (editing) await onUpdate(editing.id, draft)
      else await onCreate(draft)
      toast.success(editing ? 'Saved' : 'Created')
      setOpen(false)
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function del(row: T) {
    if (!onDelete) return
    const ok = await confirm({
      title: 'Delete',
      message: `${deleteLabel ? deleteLabel(row) : 'Delete this record'}? This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await onDelete(row)
      toast.success('Deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  const cols: DataTableColumn<T>[] = canWrite
    ? [
        ...columns,
        {
          key: '__actions',
          header: 'Actions',
          headerClassName: 'text-right',
          render: (row: T) => (
            <div className="flex justify-end gap-1">
              <button className="btn-ghost btn-sm" onClick={() => openEdit(row)} title="Edit">
                <Pencil size={15} />
              </button>
              {onDelete && (
                <button
                  className="btn-ghost btn-sm text-red-500"
                  onClick={() => del(row)}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ),
        },
      ]
    : columns

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            {headerActions}
            {canWrite && (
              <button className="btn-primary btn-sm" onClick={openCreate}>
                <Plus size={16} /> {addLabel}
              </button>
            )}
          </div>
        }
      />

      <Card className="mb-3 p-3">
        <div className="relative max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      <Card>
        <DataTable
          columns={cols}
          rows={pg.pageItems}
          rowKey={(r) => r.id}
          loading={loading}
          empty={{ icon: emptyIcon, title: emptyTitle, description: emptyDescription }}
        />
        <Pagination pg={pg} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit — ${title}` : `${addLabel}`}
        size={modalSize}
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
        {renderForm(draft, patch)}
      </Modal>
    </div>
  )
}
