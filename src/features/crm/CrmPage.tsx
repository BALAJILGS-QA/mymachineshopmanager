import { useMemo, useState } from 'react'
import { Mail, Phone, Search, Trash2, Users } from 'lucide-react'
import type { ContactMessage, ContactStatus } from './contactsApi'
import { useContacts, useDeleteContact, useUpdateContactStatus } from './hooks/useContacts'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDateTime } from '@/lib/format'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Badge, Card, Select } from '@/components/ui/primitives'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const STATUS_TONE: Record<ContactStatus, string> = {
  new: 'amber',
  contacted: 'blue',
  closed: 'green',
}
const STATUS_LABEL: Record<ContactStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  closed: 'Closed',
}

// CRM module — leads captured from the public "Contact Us" form. Presentational
// table over the shared DataTable; status is editable inline and rows can be
// removed. Data comes from contactsApi (Supabase table with a local fallback).
export function CrmPage() {
  const { data: contacts = [], isLoading } = useContacts()
  const updateStatus = useUpdateContactStatus()
  const deleteContact = useDeleteContact()
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ContactStatus>('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contacts.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        c.message.toLowerCase().includes(q)
      )
    })
  }, [contacts, search, statusFilter])

  const pg = usePagination(filtered)

  const newCount = contacts.filter((c) => c.status === 'new').length

  async function onStatusChange(c: ContactMessage, status: ContactStatus) {
    try {
      await updateStatus.mutateAsync({ id: c.id, status })
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not update status'))
    }
  }

  async function onDelete(c: ContactMessage) {
    const ok = await confirm({
      title: 'Delete enquiry',
      message: `Delete the enquiry from "${c.name}"? This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteContact.mutateAsync(c.id)
      toast.success('Enquiry deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  const columns: DataTableColumn<ContactMessage>[] = [
    {
      key: 'received',
      header: 'Received',
      cellClassName: 'whitespace-nowrap text-xs text-slate-500',
      render: (c) => fmtDateTime(c.createdAt),
    },
    {
      key: 'name',
      header: 'Name',
      cellClassName: 'font-semibold text-slate-800',
      render: (c) => c.name,
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (c) => (
        <div className="space-y-0.5">
          <a
            href={`mailto:${c.email}`}
            className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
          >
            <Mail size={13} /> {c.email}
          </a>
          {c.phone && (
            <a
              href={`tel:${c.phone}`}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:underline"
            >
              <Phone size={12} /> {c.phone}
            </a>
          )}
        </div>
      ),
    },
    { key: 'company', header: 'Company', render: (c) => c.company || '—' },
    {
      key: 'message',
      header: 'Message',
      cellClassName: 'max-w-sm',
      render: (c) => <p className="line-clamp-2 text-sm text-slate-600">{c.message}</p>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
          <Select
            className="h-8 w-[7.5rem] py-1 text-xs"
            value={c.status}
            onChange={(e) => onStatusChange(c, e.target.value as ContactStatus)}
            aria-label="Change status"
          >
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="closed">Closed</option>
          </Select>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (c) => (
        <div className="flex justify-end">
          <button
            className="btn-ghost btn-sm text-red-500"
            onClick={() => onDelete(c)}
            title="Delete enquiry"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="CRM — Contact Enquiries"
        subtitle={
          newCount > 0
            ? `${newCount} new ${newCount === 1 ? 'enquiry' : 'enquiries'} from your website`
            : 'Leads captured from your website contact form'
        }
      />

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Search name, email, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            className="w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | ContactStatus)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="closed">Closed</option>
          </Select>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(c) => c.id}
          loading={isLoading}
          empty={{
            icon: <Users size={40} />,
            title: 'No enquiries yet',
            description: 'Contact form submissions from your website will appear here.',
          }}
        />
        <Pagination pg={pg} />
      </Card>
    </div>
  )
}
