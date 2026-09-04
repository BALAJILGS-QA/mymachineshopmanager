import { useMemo, useState } from 'react'
import { Hammer } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate } from '@/lib/format'
import { usePermissions } from '@/features/hrm/permissions'
import {
  useMaintenanceRecords,
  useToolActions,
  useToolInventory,
  useTools,
} from '../hooks/useToolroom'
import { ToolActionsMenu } from '../components/ToolActionsMenu'
import { titleCase } from '../toolroomUi'
import type { ToolMaintenance } from '../types'

const STATUS_TONE: Record<string, string> = { open: 'amber', completed: 'green', scrapped: 'red' }

export function ToolMaintenancePage() {
  const records = useMaintenanceRecords().list
  const inventory = useToolInventory().data ?? []
  const tools = useTools().list.data ?? []
  const actions = useToolActions()
  const canMaintain = usePermissions().can('TOOLROOM_MAINTAIN')
  const toast = useToast()
  const toolName = (id: string) => {
    const t = tools.find((x) => x.id === id)
    return t ? `${t.code ? t.code + ' · ' : ''}${t.name}` : id
  }

  const [closing, setClosing] = useState<ToolMaintenance | null>(null)
  const [outcome, setOutcome] = useState<'passed' | 'failed'>('passed')
  const [cost, setCost] = useState('')
  const [condition, setCondition] = useState('')

  const rows = useMemo(
    () =>
      [...(records.data ?? [])].sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      ),
    [records.data],
  )
  const pg = usePagination(rows)

  async function complete() {
    if (!closing) return
    try {
      await actions.completeMaintenance.mutateAsync({
        record: closing,
        outcome,
        patch: {
          cost: cost === '' ? undefined : Number(cost),
          condition: condition || undefined,
          maintenanceDate: closing.maintenanceDate,
        },
      })
      toast.success(outcome === 'passed' ? 'Returned to available' : 'Scrapped')
      setClosing(null)
      setCost('')
      setCondition('')
    } catch (e) {
      toast.error(toUserMessage(e, 'Completion failed'))
    }
  }

  const columns: DataTableColumn<ToolMaintenance>[] = [
    {
      key: 'no',
      header: 'No.',
      cellClassName: 'font-mono text-xs',
      render: (m) => m.maintenanceNo || '—',
    },
    {
      key: 'tool',
      header: 'Tool',
      cellClassName: 'font-medium',
      render: (m) => toolName(m.toolId),
    },
    { key: 'type', header: 'Type', render: (m) => titleCase(m.maintenanceType) },
    {
      key: 'qty',
      header: 'Qty',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (m) => m.qty ?? 1,
    },
    { key: 'provider', header: 'Provider', render: (m) => m.serviceProvider || '—' },
    { key: 'due', header: 'Due', render: (m) => fmtDate(m.dueDate) },
    {
      key: 'status',
      header: 'Status',
      render: (m) => (
        <Badge tone={STATUS_TONE[m.status ?? 'open'] ?? 'slate'}>{titleCase(m.status)}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (m) =>
        m.status === 'open' && canMaintain ? (
          <button className="btn-ghost btn-sm text-brand-700" onClick={() => setClosing(m)}>
            Complete
          </button>
        ) : null,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Tool Maintenance"
        subtitle="Preventive, corrective and repair jobs. Completing returns the tool to available, or scraps it."
        actions={
          <ToolActionsMenu
            inventory={inventory}
            only={['maintenance']}
            triggerLabel="Send to Maintenance"
          />
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(m) => m.id}
          loading={records.isLoading}
          minWidthClassName="min-w-[56rem]"
          empty={{ icon: <Hammer size={40} />, title: 'No maintenance records' }}
        />
        <Pagination pg={pg} />
      </Card>

      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        title="Complete maintenance"
        size="sm"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setClosing(null)}>
              Cancel
            </button>
            <button
              className="btn-primary btn-sm"
              onClick={complete}
              disabled={actions.completeMaintenance.isPending}
            >
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Outcome">
            <Select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as 'passed' | 'failed')}
            >
              <option value="passed">Passed → back to Available</option>
              <option value="failed">Failed → Scrap</option>
            </Select>
          </Field>
          <Field label="Cost">
            <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Condition / notes">
            <Textarea value={condition} onChange={(e) => setCondition(e.target.value)} rows={2} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
