import { useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card, Field, Input } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate } from '@/lib/format'
import { usePermissions } from '@/features/hrm/permissions'
import { useReservations, useToolActions, useToolInventory, useTools } from '../hooks/useToolroom'
import { ToolActionsMenu } from '../components/ToolActionsMenu'
import { titleCase } from '../toolroomUi'
import type { ToolReservation } from '../types'

const STATUS_TONE: Record<string, string> = {
  reserved: 'blue',
  partially_issued: 'amber',
  fully_issued: 'green',
  cancelled: 'slate',
  completed: 'green',
}

export function ToolReservationsPage() {
  const reservations = useReservations().list
  const inventory = useToolInventory().data ?? []
  const tools = useTools().list.data ?? []
  const actions = useToolActions()
  const perms = usePermissions()
  const toast = useToast()
  const confirm = useConfirm()
  const toolName = (id: string) => {
    const t = tools.find((x) => x.id === id)
    return t ? `${t.code ? t.code + ' · ' : ''}${t.name}` : id
  }

  const [issuing, setIssuing] = useState<ToolReservation | null>(null)
  const [issueQty, setIssueQty] = useState(0)

  const rows = useMemo(
    () =>
      [...(reservations.data ?? [])].sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      ),
    [reservations.data],
  )
  const pg = usePagination(rows)

  async function doIssue() {
    if (!issuing) return
    try {
      await actions.issueReservation.mutateAsync({ res: issuing, qty: issueQty })
      toast.success('Issued from reservation')
      setIssuing(null)
    } catch (e) {
      toast.error(toUserMessage(e, 'Issue failed'))
    }
  }

  async function cancel(res: ToolReservation) {
    const ok = await confirm({
      title: 'Cancel reservation',
      message: 'Release the outstanding reserved quantity back to available?',
      danger: true,
      confirmLabel: 'Cancel reservation',
    })
    if (!ok) return
    try {
      await actions.release.mutateAsync(res)
      toast.success('Reservation cancelled')
    } catch (e) {
      toast.error(toUserMessage(e, 'Cancel failed'))
    }
  }

  const canIssue = perms.can('TOOLROOM_ISSUE')
  const canReserve = perms.can('TOOLROOM_RESERVE')

  const columns: DataTableColumn<ToolReservation>[] = [
    {
      key: 'no',
      header: 'Reservation',
      cellClassName: 'font-mono text-xs',
      render: (r) => r.reservationNo || '—',
    },
    {
      key: 'tool',
      header: 'Tool',
      cellClassName: 'font-medium',
      render: (r) => toolName(r.toolId),
    },
    {
      key: 'qty',
      header: 'Qty',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (r) => r.qty,
    },
    {
      key: 'issued',
      header: 'Issued',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (r) => r.issuedQty ?? 0,
    },
    {
      key: 'out',
      header: 'Outstanding',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums font-semibold',
      render: (r) => (r.qty ?? 0) - (r.issuedQty ?? 0),
    },
    { key: 'req', header: 'Required', render: (r) => fmtDate(r.requiredDate) },
    {
      key: 'ctx',
      header: 'For',
      cellClassName: 'text-xs text-slate-600',
      render: (r) => [r.machine, r.operation, r.reservedBy].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status ?? 'reserved'] ?? 'slate'}>{titleCase(r.status)}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (r) => {
        const outstanding = (r.qty ?? 0) - (r.issuedQty ?? 0)
        const open = r.status !== 'cancelled' && r.status !== 'fully_issued' && outstanding > 0
        if (!open) return null
        return (
          <div className="flex justify-end gap-1">
            {canIssue && (
              <button
                className="btn-ghost btn-sm text-brand-700"
                onClick={() => {
                  setIssuing(r)
                  setIssueQty(outstanding)
                }}
              >
                Issue
              </button>
            )}
            {canReserve && (
              <button className="btn-ghost btn-sm text-red-500" onClick={() => cancel(r)}>
                Cancel
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
        title="Tool Allocation / Reservations"
        subtitle="Reserve tools against jobs, machines and operations — reserved stock is not available to others"
        actions={
          <ToolActionsMenu inventory={inventory} only={['reserve']} triggerLabel="Reserve Tool" />
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(r) => r.id}
          loading={reservations.isLoading}
          minWidthClassName="min-w-[60rem]"
          empty={{
            icon: <CalendarClock size={40} />,
            title: 'No reservations',
            description: 'Reserve a tool to plan it against production.',
          }}
        />
        <Pagination pg={pg} />
      </Card>

      <Modal
        open={!!issuing}
        onClose={() => setIssuing(null)}
        title="Issue from reservation"
        size="sm"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setIssuing(null)}>
              Cancel
            </button>
            <button
              className="btn-primary btn-sm"
              onClick={doIssue}
              disabled={actions.issueReservation.isPending}
            >
              Issue
            </button>
          </>
        }
      >
        {issuing && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {toolName(issuing.toolId)} — {(issuing.qty ?? 0) - (issuing.issuedQty ?? 0)}{' '}
              outstanding
            </p>
            <Field label="Quantity to issue" required>
              <Input
                type="number"
                min={0}
                value={String(issueQty)}
                onChange={(e) => setIssueQty(Number(e.target.value))}
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
