// Production Module data-access — Supabase-direct. Rule-bearing writes go through
// the SECURITY DEFINER RPCs from migration 0072 (mp_* / jod_add_document), which
// enforce prod_can() + revision immutability server-side. Reads use the RLS-gated
// tables directly. Drawing/program files live in private Storage (0073).

import { uid } from '@/lib/id'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { sb } from '@/lib/api/supabaseCrud'
import {
  BUCKET_DRAWINGS,
  BUCKET_PROGRAMS,
  jobScopePath,
  sanitizeFileName,
  signedUrl,
  uploadFile,
} from '@/lib/api/storage'
import type { JobOrder, JobOrderDocument, MachineProgram, MachineProgramRevision } from '@/types'

// ---- Job order documents (part drawings) ----

export async function listJobDocuments(jobId: string): Promise<JobOrderDocument[]> {
  const { data, error } = await sb()
    .from(maps.jobOrderDocuments.table)
    .select('*')
    .eq('job_id', jobId)
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<JobOrderDocument>(r as Row, maps.jobOrderDocuments))
}

export interface UploadDrawingInput {
  job: JobOrder
  file: File
  kind?: 'drawing' | 'document'
}

/** Upload a drawing to private Storage, then record versioned metadata via RPC. */
export async function uploadJobDrawing(input: UploadDrawingInput): Promise<JobOrderDocument> {
  const { job, file } = input
  if (!job.tenantId) throw new Error('Job is missing tenant context; reload and retry.')
  const id = uid('jod_')
  const path = `${jobScopePath(job.tenantId, job.companyId, job.id)}/${id}-${sanitizeFileName(file.name)}`
  await uploadFile(BUCKET_DRAWINGS, path, file)
  const { data, error } = await sb().rpc('jod_add_document', {
    p_id: id,
    p_job_id: job.id,
    p_kind: input.kind ?? 'drawing',
    p_file_name: file.name,
    p_storage_path: path,
    p_mime: file.type,
    p_file_size: file.size,
  })
  if (error) throw error
  return fromRow<JobOrderDocument>((data as Row[])[0] ?? (data as Row), maps.jobOrderDocuments)
}

export function drawingSignedUrl(path: string): Promise<string> {
  return signedUrl(BUCKET_DRAWINGS, path, 300)
}

export function programSignedUrl(path: string): Promise<string> {
  return signedUrl(BUCKET_PROGRAMS, path, 300)
}

// ---- Machine programs + revisions ----

export async function listPrograms(jobId: string): Promise<MachineProgram[]> {
  const { data, error } = await sb()
    .from(maps.machinePrograms.table)
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => fromRow<MachineProgram>(r as Row, maps.machinePrograms))
}

export async function listProgramRevisions(programId: string): Promise<MachineProgramRevision[]> {
  const { data, error } = await sb()
    .from(maps.machineProgramRevisions.table)
    .select('*')
    .eq('program_id', programId)
    .order('rev_no', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) =>
    fromRow<MachineProgramRevision>(r as Row, maps.machineProgramRevisions),
  )
}

export interface CreateProgramInput {
  jobId: string
  programNo?: string
  process?: string
  controller?: string
  controllerOther?: string
  machine?: string
  operation?: string
  notes?: string
}

export async function createProgram(input: CreateProgramInput): Promise<MachineProgram> {
  const { data, error } = await sb().rpc('mp_create_program', {
    p_id: uid('mp_'),
    p_job_id: input.jobId,
    p_program_no: input.programNo ?? null,
    p_process: input.process ?? null,
    p_controller: input.controller ?? null,
    p_controller_other: input.controllerOther ?? null,
    p_machine: input.machine ?? null,
    p_operation: input.operation ?? null,
    p_notes: input.notes ?? null,
  })
  if (error) throw error
  return fromRow<MachineProgram>((data as Row[])[0] ?? (data as Row), maps.machinePrograms)
}

export interface AddRevisionInput {
  program: MachineProgram
  job: JobOrder
  file: File
  changeReason?: string
}

/** Upload a program file to private Storage, then record an immutable revision. */
export async function addProgramRevision(input: AddRevisionInput): Promise<MachineProgramRevision> {
  const { program, job, file } = input
  if (!job.tenantId) throw new Error('Job is missing tenant context; reload and retry.')
  const id = uid('mpr_')
  const base = jobScopePath(job.tenantId, job.companyId, job.id)
  const path = `${base}/${program.id}/${id}-${sanitizeFileName(file.name)}`
  await uploadFile(BUCKET_PROGRAMS, path, file)
  const { data, error } = await sb().rpc('mp_add_revision', {
    p_id: id,
    p_program_id: program.id,
    p_storage_path: path,
    p_file_name: file.name,
    p_file_size: file.size,
    p_mime: file.type || null,
    p_change_reason: input.changeReason ?? null,
  })
  if (error) throw error
  return fromRow<MachineProgramRevision>(
    (data as Row[])[0] ?? (data as Row),
    maps.machineProgramRevisions,
  )
}

export async function approveProgramRevision(revisionId: string): Promise<MachineProgramRevision> {
  const { data, error } = await sb().rpc('mp_approve_revision', { p_revision_id: revisionId })
  if (error) throw error
  return fromRow<MachineProgramRevision>(
    (data as Row[])[0] ?? (data as Row),
    maps.machineProgramRevisions,
  )
}
