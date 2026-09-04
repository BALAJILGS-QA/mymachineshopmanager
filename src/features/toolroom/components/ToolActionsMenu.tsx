import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu'
import { usePermissions, type PermKey } from '@/features/hrm/permissions'
import { useToolActions } from '../hooks/useToolroom'
import { ToolMoveModal, type MoveField, type MoveValues } from './ToolMoveModal'
import type { ToolInventoryRow } from '../types'

type Ceiling = Parameters<typeof ToolMoveModal>[0]['ceiling']

interface ActionDef {
  label: string
  title: string
  submitLabel: string
  perm: PermKey
  fields: MoveField[]
  ceiling: Ceiling
  run: (actions: ReturnType<typeof useToolActions>, v: MoveValues) => Promise<unknown>
}

// The full Tool Room action set. Order = menu order.
const ACTIONS: Record<string, ActionDef> = {
  receive: {
    label: 'Receive',
    title: 'Receive Tool',
    submitLabel: 'Receive',
    perm: 'TOOLROOM_RECEIVE',
    fields: ['supplier', 'cost', 'serial', 'batch', 'locationTo'],
    ceiling: 'availableQty',
    run: (a, v) =>
      a.receive.mutateAsync({
        toolId: v.toolId,
        qty: v.qty,
        unit: v.unit,
        unitCost: v.unitCost,
        serialNumber: v.serialNumber,
        batchNo: v.batchNo,
        locationTo: v.locationTo,
        note: v.supplier ? `Supplier: ${v.supplier}${v.note ? ` — ${v.note}` : ''}` : v.note,
      }),
  },
  issue: {
    label: 'Issue',
    title: 'Issue Tool',
    submitLabel: 'Issue',
    perm: 'TOOLROOM_ISSUE',
    fields: ['job', 'machine', 'operation', 'employee', 'department', 'purpose'],
    ceiling: 'availableQty',
    run: (a, v) =>
      a.issue.mutateAsync({
        input: {
          toolId: v.toolId,
          qty: v.qty,
          unit: v.unit,
          jobId: v.jobId,
          machine: v.machine,
          operation: v.operation,
          employee: v.employee,
          department: v.department,
          purpose: v.purpose,
          note: v.note,
        },
      }),
  },
  return: {
    label: 'Return',
    title: 'Return Tool',
    submitLabel: 'Return',
    perm: 'TOOLROOM_RETURN',
    fields: ['disposition', 'condition', 'job', 'machine', 'employee'],
    ceiling: 'issuedQty',
    run: (a, v) =>
      a.returnTool.mutateAsync({
        input: {
          toolId: v.toolId,
          qty: v.qty,
          unit: v.unit,
          jobId: v.jobId,
          machine: v.machine,
          employee: v.employee,
          condition: v.condition,
          note: v.note,
        },
        disposition: v.disposition ?? 'available',
      }),
  },
  consume: {
    label: 'Consume',
    title: 'Consume Tool',
    submitLabel: 'Consume',
    perm: 'TOOLROOM_ISSUE',
    fields: ['job', 'machine', 'employee'],
    ceiling: 'issuedQty',
    run: (a, v) =>
      a.consume.mutateAsync({
        toolId: v.toolId,
        qty: v.qty,
        unit: v.unit,
        jobId: v.jobId,
        machine: v.machine,
        employee: v.employee,
        note: v.note,
      }),
  },
  reserve: {
    label: 'Reserve',
    title: 'Reserve Tool',
    submitLabel: 'Reserve',
    perm: 'TOOLROOM_RESERVE',
    fields: ['job', 'machine', 'operation', 'requiredDate', 'reservedBy'],
    ceiling: 'availableQty',
    run: (a, v) =>
      a.reserve.mutateAsync({
        toolId: v.toolId,
        qty: v.qty,
        unit: v.unit,
        jobId: v.jobId,
        machine: v.machine,
        operation: v.operation,
        requiredDate: v.requiredDate,
        reservedBy: v.reservedBy,
        note: v.note,
      }),
  },
  transfer: {
    label: 'Transfer',
    title: 'Transfer Tool',
    submitLabel: 'Transfer',
    perm: 'TOOLROOM_TRANSFER',
    fields: ['locationFrom', 'locationTo'],
    ceiling: 'availableQty',
    run: (a, v) =>
      a.transfer.mutateAsync({
        toolId: v.toolId,
        qty: v.qty,
        unit: v.unit,
        locationFrom: v.locationFrom,
        locationTo: v.locationTo,
        note: v.note,
      }),
  },
  maintenance: {
    label: 'Send to Maintenance',
    title: 'Send Tool for Maintenance',
    submitLabel: 'Send',
    perm: 'TOOLROOM_MAINTAIN',
    fields: ['maintenanceType', 'dueDate', 'agency'],
    ceiling: 'availableQty',
    run: (a, v) =>
      a.sendMaintenance.mutateAsync({
        toolId: v.toolId,
        qty: v.qty,
        unit: v.unit,
        maintenanceType: v.maintenanceType,
        dueDate: v.dueDate,
        serviceProvider: v.agency,
        note: v.note,
      }),
  },
  calibration: {
    label: 'Send to Calibration',
    title: 'Send Tool for Calibration',
    submitLabel: 'Send',
    perm: 'TOOLROOM_CALIBRATE',
    fields: ['dueDate', 'agency'],
    ceiling: 'availableQty',
    run: (a, v) =>
      a.sendCalibration.mutateAsync({
        toolId: v.toolId,
        qty: v.qty,
        unit: v.unit,
        dueDate: v.dueDate,
        agency: v.agency,
        note: v.note,
      }),
  },
  scrap: {
    label: 'Scrap',
    title: 'Scrap Tool',
    submitLabel: 'Scrap',
    perm: 'TOOLROOM_SCRAP',
    fields: ['condition'],
    ceiling: 'availableQty',
    run: (a, v) =>
      a.scrap.mutateAsync({
        toolId: v.toolId,
        qty: v.qty,
        unit: v.unit,
        condition: v.condition,
        note: v.note,
      }),
  },
  adjust: {
    label: 'Adjust Stock',
    title: 'Adjust Stock',
    submitLabel: 'Post adjustment',
    perm: 'TOOLROOM_ADJUST',
    fields: ['adjust'],
    ceiling: 'onHandQty',
    run: (a, v) =>
      a.adjust.mutateAsync({
        toolId: v.toolId,
        qty: v.qty,
        unit: v.unit,
        adjustBucket: v.adjustBucket,
        adjustIn: v.adjustIn,
        note: v.note,
      }),
  },
}

export type ToolActionKey = keyof typeof ACTIONS

// Actions menu + hosted modal. Used per inventory row (toolId set, compact
// trigger) and on the Tool Detail header. `only` restricts which actions show.
export function ToolActionsMenu({
  inventory,
  toolId,
  only,
  triggerLabel = 'Actions',
  compact = false,
}: {
  inventory: ToolInventoryRow[]
  toolId?: string
  only?: ToolActionKey[]
  triggerLabel?: string
  compact?: boolean
}) {
  const perms = usePermissions()
  const actions = useToolActions()
  const [active, setActive] = useState<ToolActionKey | null>(null)

  const keys = (only ?? (Object.keys(ACTIONS) as ToolActionKey[])).filter((k) =>
    perms.can(ACTIONS[k].perm),
  )
  if (keys.length === 0) return null
  const def = active ? ACTIONS[active] : null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={compact ? 'btn-ghost btn-sm' : 'btn-secondary btn-sm'}>
            {triggerLabel}
            <ChevronDown size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {keys.map((k) => (
            <DropdownMenuItem key={k} onSelect={() => setActive(k)}>
              {ACTIONS[k].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {def && (
        <ToolMoveModal
          open={!!active}
          onClose={() => setActive(null)}
          title={def.title}
          submitLabel={def.submitLabel}
          inventory={inventory}
          fields={def.fields}
          ceiling={def.ceiling}
          defaultToolId={toolId}
          lockTool={!!toolId}
          onSubmit={(v) => def.run(actions, v)}
        />
      )}
    </>
  )
}
