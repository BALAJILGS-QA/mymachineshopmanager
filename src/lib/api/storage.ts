// Supabase Storage helpers for production artifacts (part drawings + machine
// programs). Buckets are PRIVATE (migration 0073); authorization is enforced by
// storage.objects RLS, so uploads/signed URLs run with the user's anon-key JWT —
// no service-role key is ever used in the browser.
//
// Path convention (first folder MUST be the tenant_id so the RLS tenant check
// passes): {tenant_id}/{company_id|shop}/{job_id}/...

import { sb } from '@/lib/api/supabaseCrud'

export const BUCKET_DRAWINGS = 'job-drawings'
export const BUCKET_PROGRAMS = 'machine-programs'

export const DRAWING_MIME = ['application/pdf', 'image/png', 'image/jpeg'] as const
export const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB (matches DB CHECK)
// Machine-program artifacts are plain-text numeric code; validated by extension.
export const PROGRAM_EXTENSIONS = ['nc', 'tap', 'gcode', 'gc', 'mpf', 'cnc', 'eia', 'txt'] as const

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

export function jobScopePath(
  tenantId: string,
  companyId: string | undefined,
  jobId: string,
): string {
  return `${tenantId}/${companyId ?? 'shop'}/${jobId}`
}

/** Validate a part-drawing upload client-side (mirrors server CHECK + RPC). */
export function validateDrawing(file: File): string | null {
  if (!(DRAWING_MIME as readonly string[]).includes(file.type)) {
    return 'Unsupported file type. Allowed: PDF, PNG, JPG.'
  }
  if (file.size > MAX_FILE_BYTES) return 'File exceeds the 25 MB limit.'
  return null
}

/** Validate a machine-program upload client-side. */
export function validateProgramFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!(PROGRAM_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Unsupported program file. Allowed: ${PROGRAM_EXTENSIONS.join(', ')}.`
  }
  if (file.size > MAX_FILE_BYTES) return 'File exceeds the 25 MB limit.'
  return null
}

export async function uploadFile(bucket: string, path: string, file: File): Promise<string> {
  const { error } = await sb()
    .storage.from(bucket)
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (error) throw error
  return path
}

/** Create a short-lived signed URL for a private object (server-authorized by RLS). */
export async function signedUrl(bucket: string, path: string, expiresIn = 300): Promise<string> {
  const { data, error } = await sb().storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}
