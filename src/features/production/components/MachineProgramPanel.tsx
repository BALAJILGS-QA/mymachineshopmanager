'use client'

import { useRef, useState } from 'react'
import { AlertTriangle, Cpu, Plus, Upload, CheckCircle2, Eye } from 'lucide-react'
import type { JobOrder, MachineProgram } from '@/types'
import { Card, EmptyState, Field, Input, Select, Textarea, Badge } from '@/components/ui/primitives'
import { DrawingViewer } from '@/components/common/DrawingViewer'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDateTime } from '@/lib/format'
import { BUCKET_PROGRAMS, validateProgramFile } from '@/lib/api/storage'
import {
  useAddProgramRevision,
  useApproveProgramRevision,
  useCreateProgram,
  useProgramRevisions,
  usePrograms,
} from '../hooks/useProduction'

const PROCESSES = ['CNC', 'VMC', 'HMC', 'Milling', 'Turning', 'Drilling', 'Grinding', 'Other']
const CONTROLLERS = ['FANUC', 'HUST', 'Siemens', 'Mitsubishi', 'Haas', 'Other']

const PROGRAM_TONE: Record<string, string> = {
  Draft: 'gray',
  Review: 'amber',
  Approved: 'green',
  Superseded: 'slate',
}

export function MachineProgramPanel({
  job,
  canUpload,
  canApprove,
  canView,
}: {
  job: JobOrder
  canUpload: boolean
  canApprove: boolean
  canView: boolean
}) {
  const { data: programs = [], isLoading, isError, error } = usePrograms(job.id)
  const create = useCreateProgram()
  const toast = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    programNo: '',
    process: 'CNC',
    controller: 'FANUC',
    controllerOther: '',
    machine: '',
    operation: '',
    notes: '',
  })

  async function submitCreate() {
    try {
      await create.mutateAsync({
        jobId: job.id,
        programNo: form.programNo || undefined,
        process: form.process,
        controller: form.controller,
        controllerOther: form.controller === 'Other' ? form.controllerOther : undefined,
        machine: form.machine || undefined,
        operation: form.operation || undefined,
        notes: form.notes || undefined,
      })
      toast.success('Program created (Draft)')
      setShowCreate(false)
      setForm({
        programNo: '',
        process: 'CNC',
        controller: 'FANUC',
        controllerOther: '',
        machine: '',
        operation: '',
        notes: '',
      })
    } catch (ex) {
      toast.error(toUserMessage(ex))
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Machine Programs (G-code / M-code)</h3>
        {canUpload && (
          <button className="btn-secondary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New program
          </button>
        )}
      </div>

      <div className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 p-2 text-2xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
        <span>
          Uploaded programs are stored as <strong>DRAFT / NOT MACHINE-VERIFIED</strong> artifacts. A
          program must be reviewed and approved by an authorized engineer before it is the active
          production program. Files are never executed by the application.
        </span>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading programs…</p>}
      {isError && <p className="text-sm text-red-600">{toUserMessage(error)}</p>}
      {!isLoading && !isError && programs.length === 0 && (
        <EmptyState
          icon={<Cpu className="h-6 w-6" />}
          title="No machine programs"
          description={
            canUpload ? 'Create a program, then upload revisions.' : 'No programs for this job.'
          }
        />
      )}

      <div className="space-y-3">
        {programs.map((p) => (
          <ProgramCard
            key={p.id}
            program={p}
            job={job}
            canUpload={canUpload}
            canApprove={canApprove}
            canView={canView}
          />
        ))}
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New machine program"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submitCreate} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Program No">
            <Input
              value={form.programNo}
              onChange={(e) => setForm({ ...form, programNo: e.target.value })}
              placeholder="e.g. O1234"
            />
          </Field>
          <Field label="Process">
            <Select
              value={form.process}
              onChange={(e) => setForm({ ...form, process: e.target.value })}
            >
              {PROCESSES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Controller">
            <Select
              value={form.controller}
              onChange={(e) => setForm({ ...form, controller: e.target.value })}
            >
              {CONTROLLERS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          {form.controller === 'Other' && (
            <Field label="Controller (specify)">
              <Input
                value={form.controllerOther}
                onChange={(e) => setForm({ ...form, controllerOther: e.target.value })}
              />
            </Field>
          )}
          <Field label="Machine">
            <Input
              value={form.machine}
              onChange={(e) => setForm({ ...form, machine: e.target.value })}
            />
          </Field>
          <Field label="Operation">
            <Input
              value={form.operation}
              onChange={(e) => setForm({ ...form, operation: e.target.value })}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  )
}

function ProgramCard({
  program,
  job,
  canUpload,
  canApprove,
  canView,
}: {
  program: MachineProgram
  job: JobOrder
  canUpload: boolean
  canApprove: boolean
  canView: boolean
}) {
  const { data: revisions = [] } = useProgramRevisions(program.id)
  const addRev = useAddProgramRevision()
  const approve = useApproveProgramRevision()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [reason, setReason] = useState('')
  const [viewPath, setViewPath] = useState<{ path: string; name?: string } | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    const err = validateProgramFile(file)
    if (err) {
      toast.error(err)
      return
    }
    try {
      await addRev.mutateAsync({ program, job, file, changeReason: reason || undefined })
      toast.success('Revision uploaded (Draft)')
      setReason('')
    } catch (ex) {
      toast.error(toUserMessage(ex))
    }
  }

  async function onApprove(revId: string) {
    try {
      await approve.mutateAsync(revId)
      toast.success('Revision approved')
    } catch (ex) {
      toast.error(toUserMessage(ex))
    }
  }

  const controllerLabel =
    program.controller === 'Other' ? program.controllerOther || 'Other' : program.controller

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-sm font-semibold text-slate-800">
            {program.programNo || 'Program'}
          </span>{' '}
          <span className="text-2xs text-slate-500">
            {program.process} · {controllerLabel}
            {program.machine ? ` · ${program.machine}` : ''}
          </span>
        </div>
        <Badge tone={PROGRAM_TONE[program.status] ?? 'gray'}>{program.status}</Badge>
      </div>

      {canUpload && (
        <div className="mt-2 flex items-end gap-2">
          <Field label="Change reason (for next revision)" className="flex-1">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this revision?"
            />
          </Field>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".nc,.tap,.gcode,.gc,.mpf,.cnc,.eia,.txt"
            onChange={onPick}
          />
          <button
            className="btn-secondary btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={addRev.isPending}
          >
            <Upload className="mr-1 h-4 w-4" />
            {addRev.isPending ? 'Uploading…' : 'Add revision'}
          </button>
        </div>
      )}

      {revisions.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100">
          {revisions.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <span className="text-xs font-medium text-slate-700">
                  REV-{String(r.revNo).padStart(2, '0')}
                </span>{' '}
                <Badge tone={PROGRAM_TONE[r.status] ?? 'gray'}>{r.status}</Badge>{' '}
                <span className="text-2xs text-slate-500">
                  {r.fileName} · {fmtDateTime(r.createdAt)}
                  {r.createdBy ? ` · ${r.createdBy}` : ''}
                  {r.approvedBy ? ` · approved by ${r.approvedBy}` : ''}
                </span>
                {r.changeReason && (
                  <p className="text-2xs italic text-slate-400">{r.changeReason}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {canView && r.storagePath && (
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => setViewPath({ path: r.storagePath!, name: r.fileName })}
                  >
                    <Eye className="mr-1 h-4 w-4" />
                    View
                  </button>
                )}
                {canApprove && r.status !== 'Approved' && r.status !== 'Superseded' && (
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => onApprove(r.id)}
                    disabled={approve.isPending}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Approve
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewPath && (
        <DrawingViewer
          open={!!viewPath}
          onClose={() => setViewPath(null)}
          bucket={BUCKET_PROGRAMS}
          path={viewPath.path}
          fileName={viewPath.name}
          mime="text/plain"
        />
      )}
    </div>
  )
}
