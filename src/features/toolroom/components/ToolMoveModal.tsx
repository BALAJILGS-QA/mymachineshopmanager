import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { ToolSelect } from '../toolroomUi'
import type { ToolInventoryRow } from '../types'
import type { ReturnDisposition } from '../toolroomApi'

// Which optional fields a given action needs. The tool + qty are always shown.
export type MoveField =
  | 'job'
  | 'machine'
  | 'operation'
  | 'employee'
  | 'department'
  | 'purpose'
  | 'expectedReturn'
  | 'locationFrom'
  | 'locationTo'
  | 'condition'
  | 'disposition'
  | 'serial'
  | 'batch'
  | 'cost'
  | 'supplier'
  | 'requiredDate'
  | 'reservedBy'
  | 'maintenanceType'
  | 'dueDate'
  | 'agency'
  | 'adjust'

export interface MoveValues {
  toolId: string
  qty: number
  unit?: string
  jobId?: string
  machine?: string
  operation?: string
  employee?: string
  department?: string
  purpose?: string
  locationFrom?: string
  locationTo?: string
  condition?: string
  disposition?: ReturnDisposition
  serialNumber?: string
  batchNo?: string
  unitCost?: number
  supplier?: string
  requiredDate?: string
  reservedBy?: string
  maintenanceType?: string
  dueDate?: string
  agency?: string
  adjustBucket?: string
  adjustIn?: boolean
  note?: string
}

// The bucket whose live quantity is the ceiling for this action, shown as a hint
// and used for a soft client-side check (the DB is the real gate).
type Ceiling = keyof Pick<
  ToolInventoryRow,
  'availableQty' | 'issuedQty' | 'reservedQty' | 'maintenanceQty' | 'calibrationQty' | 'onHandQty'
>

const CONDITIONS = [
  'Good',
  'Used',
  'Worn',
  'Damaged',
  'Broken',
  'Scrap',
  'Needs Maintenance',
  'Needs Calibration',
]
const MAINT_TYPES = [
  'preventive',
  'corrective',
  'repair',
  'sharpening',
  'reconditioning',
  'replacement',
]

export function ToolMoveModal({
  open,
  onClose,
  title,
  submitLabel = 'Confirm',
  inventory,
  fields = [],
  ceiling = 'availableQty',
  defaultToolId,
  lockTool = false,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  title: string
  submitLabel?: string
  inventory: ToolInventoryRow[]
  fields?: MoveField[]
  ceiling?: Ceiling
  defaultToolId?: string
  lockTool?: boolean
  onSubmit: (values: MoveValues) => Promise<unknown>
}) {
  const toast = useToast()
  const jobs = useJobs().data ?? []
  const [v, setV] = useState<MoveValues>({ toolId: defaultToolId ?? '', qty: 1 })
  const [saving, setSaving] = useState(false)
  const has = (f: MoveField) => fields.includes(f)
  const set = (p: Partial<MoveValues>) => setV((prev) => ({ ...prev, ...p }))

  useEffect(() => {
    if (open)
      setV({
        toolId: defaultToolId ?? '',
        qty: 1,
        disposition: has('disposition') ? 'available' : undefined,
        adjustBucket: has('adjust') ? 'available' : undefined,
        adjustIn: has('adjust') ? true : undefined,
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultToolId])

  const selected = useMemo(
    () => inventory.find((r) => r.toolId === v.toolId),
    [inventory, v.toolId],
  )
  const ceilingQty = selected ? Number(selected[ceiling] ?? 0) : undefined

  async function submit() {
    if (!v.toolId) return toast.error('Select a tool')
    if (!v.qty || v.qty <= 0) return toast.error('Quantity must be greater than zero')
    // No source-bucket ceiling when adding stock (receipt / positive adjustment).
    const skipCeiling = has('adjust') && v.adjustIn
    if (!skipCeiling && ceilingQty !== undefined && v.qty > ceilingQty) {
      return toast.error(
        `Only ${ceilingQty} ${selected?.uom ?? ''} in ${ceiling.replace('Qty', '')} for this tool`,
      )
    }
    setSaving(true)
    try {
      await onSubmit({ ...v, unit: selected?.uom })
      toast.success('Done')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Transaction failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <button className="btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary btn-sm" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tool" required className="sm:col-span-2">
          {lockTool && selected ? (
            <Input
              value={`${selected.code ? selected.code + ' · ' : ''}${selected.name}`}
              readOnly
            />
          ) : (
            <ToolSelect
              inventory={inventory}
              value={v.toolId}
              onChange={(id) => set({ toolId: id })}
              bucket={ceiling}
              required
            />
          )}
        </Field>

        <Field
          label="Quantity"
          required
          hint={
            ceilingQty !== undefined
              ? `${ceilingQty} ${selected?.uom ?? ''} in ${ceiling.replace('Qty', '')}`
              : undefined
          }
        >
          <Input
            type="number"
            min={0}
            step="any"
            value={String(v.qty)}
            onChange={(e) => set({ qty: Number(e.target.value) })}
          />
        </Field>

        {has('disposition') && (
          <Field label="Return disposition" required>
            <Select
              value={v.disposition ?? 'available'}
              onChange={(e) => set({ disposition: e.target.value as ReturnDisposition })}
            >
              <option value="available">Good → Available</option>
              <option value="damaged">Damaged</option>
              <option value="maintenance">Needs maintenance</option>
              <option value="calibration">Needs calibration</option>
            </Select>
          </Field>
        )}

        {has('adjust') && (
          <>
            <Field label="Bucket">
              <Select
                value={v.adjustBucket ?? 'available'}
                onChange={(e) => set({ adjustBucket: e.target.value })}
              >
                <option value="available">Available</option>
                <option value="issued">Issued</option>
                <option value="reserved">Reserved</option>
                <option value="maintenance">Maintenance</option>
                <option value="calibration">Calibration</option>
                <option value="damaged">Damaged</option>
              </Select>
            </Field>
            <Field label="Direction">
              <Select
                value={v.adjustIn ? 'in' : 'out'}
                onChange={(e) => set({ adjustIn: e.target.value === 'in' })}
              >
                <option value="in">Increase (+)</option>
                <option value="out">Decrease (−)</option>
              </Select>
            </Field>
          </>
        )}

        {has('condition') && (
          <Field label="Condition">
            <Select
              value={v.condition ?? ''}
              onChange={(e) => set({ condition: e.target.value || undefined })}
            >
              <option value="">—</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {has('maintenanceType') && (
          <Field label="Maintenance type">
            <Select
              value={v.maintenanceType ?? 'preventive'}
              onChange={(e) => set({ maintenanceType: e.target.value })}
            >
              {MAINT_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {has('job') && (
          <Field label="Job / Work order">
            <Select
              value={v.jobId ?? ''}
              onChange={(e) => set({ jobId: e.target.value || undefined })}
            >
              <option value="">—</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jobNo} · {j.partName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {has('machine') && (
          <Field label="Machine">
            <Input
              value={v.machine ?? ''}
              onChange={(e) => set({ machine: e.target.value })}
              placeholder="CNC-01"
            />
          </Field>
        )}
        {has('operation') && (
          <Field label="Operation">
            <Input value={v.operation ?? ''} onChange={(e) => set({ operation: e.target.value })} />
          </Field>
        )}
        {has('employee') && (
          <Field label="Employee">
            <Input value={v.employee ?? ''} onChange={(e) => set({ employee: e.target.value })} />
          </Field>
        )}
        {has('department') && (
          <Field label="Department">
            <Input
              value={v.department ?? ''}
              onChange={(e) => set({ department: e.target.value })}
            />
          </Field>
        )}
        {has('purpose') && (
          <Field label="Purpose">
            <Input value={v.purpose ?? ''} onChange={(e) => set({ purpose: e.target.value })} />
          </Field>
        )}
        {has('requiredDate') && (
          <Field label="Required date">
            <Input
              type="date"
              value={v.requiredDate ?? ''}
              onChange={(e) => set({ requiredDate: e.target.value || undefined })}
            />
          </Field>
        )}
        {has('reservedBy') && (
          <Field label="Reserved by">
            <Input
              value={v.reservedBy ?? ''}
              onChange={(e) => set({ reservedBy: e.target.value })}
            />
          </Field>
        )}
        {has('dueDate') && (
          <Field label="Due date">
            <Input
              type="date"
              value={v.dueDate ?? ''}
              onChange={(e) => set({ dueDate: e.target.value || undefined })}
            />
          </Field>
        )}
        {has('agency') && (
          <Field label="Agency / provider">
            <Input value={v.agency ?? ''} onChange={(e) => set({ agency: e.target.value })} />
          </Field>
        )}
        {has('locationFrom') && (
          <Field label="From location">
            <Input
              value={v.locationFrom ?? ''}
              onChange={(e) => set({ locationFrom: e.target.value })}
            />
          </Field>
        )}
        {has('locationTo') && (
          <Field label="To location">
            <Input
              value={v.locationTo ?? ''}
              onChange={(e) => set({ locationTo: e.target.value })}
            />
          </Field>
        )}
        {has('serial') && (
          <Field label="Serial number">
            <Input
              value={v.serialNumber ?? ''}
              onChange={(e) => set({ serialNumber: e.target.value })}
            />
          </Field>
        )}
        {has('batch') && (
          <Field label="Batch number">
            <Input value={v.batchNo ?? ''} onChange={(e) => set({ batchNo: e.target.value })} />
          </Field>
        )}
        {has('cost') && (
          <Field label="Unit cost">
            <Input
              type="number"
              value={v.unitCost ?? ''}
              onChange={(e) =>
                set({ unitCost: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </Field>
        )}
        {has('supplier') && (
          <Field label="Supplier">
            <Input value={v.supplier ?? ''} onChange={(e) => set({ supplier: e.target.value })} />
          </Field>
        )}

        <Field label="Remarks" className="sm:col-span-2">
          <Textarea value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} rows={2} />
        </Field>
      </div>
    </Modal>
  )
}
