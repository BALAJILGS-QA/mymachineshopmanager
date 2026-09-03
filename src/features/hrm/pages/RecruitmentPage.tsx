import { useState } from 'react'
import { Briefcase, Users } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import { useCandidates, useDepartments, useDesignations, useJobOpenings } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import type { Candidate, JobOpening } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/primitives'

const STAGE_TONE: Record<string, string> = {
  applied: 'slate',
  screening: 'blue',
  interview: 'amber',
  selected: 'green',
  offer: 'violet',
  joined: 'green',
  rejected: 'red',
}

export function RecruitmentPage() {
  const openings = useJobOpenings()
  const candidates = useCandidates()
  const departments = useDepartments().list.data ?? []
  const designations = useDesignations().list.data ?? []
  const perms = usePermissions()
  const canManage = perms.can('RECRUITMENT_MANAGE')
  const [view, setView] = useState<'openings' | 'candidates'>('openings')

  const deptName = (id?: string) => departments.find((d) => d.id === id)?.name ?? '—'
  const jobTitle = (id?: string) => openings.list.data?.find((j) => j.id === id)?.title ?? '—'

  const openingCols: DataTableColumn<JobOpening>[] = [
    { key: 'title', header: 'Position', cellClassName: 'font-semibold', render: (o) => o.title },
    { key: 'dept', header: 'Department', render: (o) => deptName(o.departmentId) },
    { key: 'openings', header: 'Openings', cellClassName: 'tnum', render: (o) => o.openings },
    { key: 'location', header: 'Location', render: (o) => o.location || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (o) => <Badge tone={o.status === 'open' ? 'green' : 'slate'}>{o.status}</Badge>,
    },
  ]

  const candidateCols: DataTableColumn<Candidate>[] = [
    { key: 'name', header: 'Candidate', cellClassName: 'font-semibold', render: (c) => c.name },
    { key: 'job', header: 'Applied for', render: (c) => jobTitle(c.jobId) },
    {
      key: 'contact',
      header: 'Contact',
      cellClassName: 'text-xs',
      render: (c) => c.email || c.phone || '—',
    },
    { key: 'source', header: 'Source', render: (c) => c.source || '—' },
    {
      key: 'stage',
      header: 'Stage',
      render: (c) => <Badge tone={STAGE_TONE[c.stage] ?? 'slate'}>{c.stage}</Badge>,
    },
  ]

  const tabBtn = (v: 'openings' | 'candidates', label: string) => (
    <button
      onClick={() => setView(v)}
      className={
        'rounded-lg px-3 py-1.5 text-sm font-medium ' +
        (view === v ? 'bg-brand-100 text-brand-800' : 'text-slate-500 hover:bg-slate-100')
      }
    >
      {label}
    </button>
  )

  const switcher = (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
      {tabBtn('openings', 'Job Openings')}
      {tabBtn('candidates', 'Candidates')}
    </div>
  )

  if (view === 'openings') {
    return (
      <MasterManager<JobOpening>
        title="Recruitment"
        subtitle="Open positions and the candidate pipeline"
        addLabel="Add Opening"
        emptyIcon={<Briefcase size={40} />}
        emptyTitle="No job openings"
        rows={openings.list.data ?? []}
        loading={openings.list.isLoading}
        columns={openingCols}
        canWrite={canManage}
        headerActions={switcher}
        search={(o, q) => o.title.toLowerCase().includes(q)}
        emptyDraft={() => ({ title: '', openings: 1, status: 'open' })}
        toDraft={(o) => ({ ...o })}
        validate={(d) => (!String(d.title).trim() ? 'Title is required' : null)}
        onCreate={(d) => openings.create.mutateAsync(d as Partial<JobOpening>)}
        onUpdate={(id, d) => openings.update.mutateAsync({ id, patch: d as Partial<JobOpening> })}
        onDelete={(o) => openings.remove.mutateAsync(o.id)}
        renderForm={(draft, patch) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Title" required className="sm:col-span-2">
              <Input
                value={String(draft.title ?? '')}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </Field>
            <Field label="Department">
              <Select
                value={String(draft.departmentId ?? '')}
                onChange={(e) => patch({ departmentId: e.target.value || undefined })}
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Designation">
              <Select
                value={String(draft.designationId ?? '')}
                onChange={(e) => patch({ designationId: e.target.value || undefined })}
              >
                <option value="">—</option>
                {designations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Openings">
              <Input
                type="number"
                value={String(draft.openings ?? 1)}
                onChange={(e) => patch({ openings: Number(e.target.value) })}
              />
            </Field>
            <Field label="Location">
              <Input
                value={String(draft.location ?? '')}
                onChange={(e) => patch({ location: e.target.value })}
              />
            </Field>
            <Field label="Employment type">
              <Input
                value={String(draft.employmentType ?? '')}
                onChange={(e) => patch({ employmentType: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <Select
                value={String(draft.status ?? 'open')}
                onChange={(e) => patch({ status: e.target.value })}
              >
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="on_hold">On hold</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={String(draft.description ?? '')}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </Field>
            <Field label="Requirements" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={String(draft.requirements ?? '')}
                onChange={(e) => patch({ requirements: e.target.value })}
              />
            </Field>
          </div>
        )}
      />
    )
  }

  return (
    <MasterManager<Candidate>
      title="Recruitment"
      subtitle="Open positions and the candidate pipeline"
      addLabel="Add Candidate"
      emptyIcon={<Users size={40} />}
      emptyTitle="No candidates"
      rows={candidates.list.data ?? []}
      loading={candidates.list.isLoading}
      columns={candidateCols}
      canWrite={canManage}
      headerActions={switcher}
      search={(c, q) => c.name.toLowerCase().includes(q)}
      emptyDraft={() => ({ name: '', stage: 'applied' })}
      toDraft={(c) => ({ ...c })}
      validate={(d) => (!String(d.name).trim() ? 'Name is required' : null)}
      onCreate={(d) => candidates.create.mutateAsync(d as Partial<Candidate>)}
      onUpdate={(id, d) => candidates.update.mutateAsync({ id, patch: d as Partial<Candidate> })}
      onDelete={(c) => candidates.remove.mutateAsync(c.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="Applied for">
            <Select
              value={String(draft.jobId ?? '')}
              onChange={(e) => patch({ jobId: e.target.value || undefined })}
            >
              <option value="">—</option>
              {(openings.list.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stage">
            <Select
              value={String(draft.stage ?? 'applied')}
              onChange={(e) => patch({ stage: e.target.value })}
            >
              {['applied', 'screening', 'interview', 'selected', 'offer', 'joined', 'rejected'].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={String(draft.email ?? '')}
              onChange={(e) => patch({ email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={String(draft.phone ?? '')}
              onChange={(e) => patch({ phone: e.target.value })}
            />
          </Field>
          <Field label="Source">
            <Input
              value={String(draft.source ?? '')}
              onChange={(e) => patch({ source: e.target.value })}
              placeholder="Referral, LinkedIn…"
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={String(draft.notes ?? '')}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Field>
        </div>
      )}
    />
  )
}
