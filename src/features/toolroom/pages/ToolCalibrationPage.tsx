import { useMemo, useState } from 'react'
import { Ruler } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card, Field, Input } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate, todayISO } from '@/lib/format'
import { usePermissions } from '@/features/hrm/permissions'
import {
  useCalibrationRecords,
  useToolActions,
  useToolInventory,
  useTools,
} from '../hooks/useToolroom'
import { ToolActionsMenu } from '../components/ToolActionsMenu'
import type { ToolCalibration } from '../types'

// Effective calibration status factoring due date (valid records that have
// passed/near their due date surface as due/overdue for the alerts).
function effectiveStatus(c: ToolCalibration): { label: string; tone: string } {
  if (c.status === 'failed') return { label: 'Failed', tone: 'red' }
  if (c.dueDate) {
    const days = Math.round(
      (new Date(c.dueDate).getTime() - new Date(todayISO()).getTime()) / 86_400_000,
    )
    if (days < 0) return { label: 'Overdue', tone: 'red' }
    if (days <= 30) return { label: 'Due soon', tone: 'amber' }
  }
  return { label: 'Valid', tone: 'green' }
}

export function ToolCalibrationPage() {
  const records = useCalibrationRecords().list
  const inventory = useToolInventory().data ?? []
  const tools = useTools().list.data ?? []
  const actions = useToolActions()
  const canCalibrate = usePermissions().can('TOOLROOM_CALIBRATE')
  const toast = useToast()
  const toolName = (id: string) => {
    const t = tools.find((x) => x.id === id)
    return t ? `${t.code ? t.code + ' · ' : ''}${t.name}` : id
  }

  const [closing, setClosing] = useState<ToolCalibration | null>(null)
  const [pass, setPass] = useState(true)
  const [cert, setCert] = useState('')
  const [accuracy, setAccuracy] = useState('')
  const [dueDate, setDueDate] = useState('')

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
      await actions.completeCalibration.mutateAsync({
        record: closing,
        outcome: pass ? 'pass' : 'fail',
        patch: {
          certificateNo: cert || undefined,
          accuracy: accuracy || undefined,
          dueDate: dueDate || closing.dueDate,
          calibrationDate: todayISO(),
        },
      })
      toast.success(pass ? 'Calibration passed' : 'Failed → scrapped')
      setClosing(null)
      setCert('')
      setAccuracy('')
      setDueDate('')
    } catch (e) {
      toast.error(toUserMessage(e, 'Completion failed'))
    }
  }

  const columns: DataTableColumn<ToolCalibration>[] = [
    {
      key: 'no',
      header: 'No.',
      cellClassName: 'font-mono text-xs',
      render: (c) => c.calibrationNo || '—',
    },
    {
      key: 'tool',
      header: 'Tool',
      cellClassName: 'font-medium',
      render: (c) => toolName(c.toolId),
    },
    { key: 'agency', header: 'Agency', render: (c) => c.agency || '—' },
    {
      key: 'cert',
      header: 'Certificate',
      cellClassName: 'font-mono text-xs',
      render: (c) => c.certificateNo || '—',
    },
    { key: 'cal', header: 'Calibrated', render: (c) => fmtDate(c.calibrationDate) },
    { key: 'due', header: 'Due', render: (c) => fmtDate(c.dueDate) },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const s = effectiveStatus(c)
        return <Badge tone={s.tone}>{s.label}</Badge>
      },
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (c) =>
        c.status !== 'failed' && canCalibrate ? (
          <button
            className="btn-ghost btn-sm text-brand-700"
            onClick={() => {
              setClosing(c)
              setDueDate(c.dueDate ?? '')
            }}
          >
            Complete
          </button>
        ) : null,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Tool Calibration"
        subtitle="Calibration for measuring & controlled tools. Failed/overdue tools are flagged and kept out of controlled use."
        actions={
          <ToolActionsMenu
            inventory={inventory}
            only={['calibration']}
            triggerLabel="Send to Calibration"
          />
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(c) => c.id}
          loading={records.isLoading}
          minWidthClassName="min-w-[56rem]"
          empty={{ icon: <Ruler size={40} />, title: 'No calibration records' }}
        />
        <Pagination pg={pg} />
      </Card>

      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        title="Complete calibration"
        size="sm"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setClosing(null)}>
              Cancel
            </button>
            <button
              className="btn-primary btn-sm"
              onClick={complete}
              disabled={actions.completeCalibration.isPending}
            >
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Result">
            <select
              className="input"
              value={pass ? 'pass' : 'fail'}
              onChange={(e) => setPass(e.target.value === 'pass')}
            >
              <option value="pass">Pass → Valid, back to Available</option>
              <option value="fail">Fail → Scrap</option>
            </select>
          </Field>
          <Field label="Certificate no.">
            <Input value={cert} onChange={(e) => setCert(e.target.value)} />
          </Field>
          <Field label="Accuracy / result">
            <Input value={accuracy} onChange={(e) => setAccuracy(e.target.value)} />
          </Field>
          <Field label="Next due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
