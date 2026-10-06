'use client'

import { useRef, useState } from 'react'
import { FileText, Upload, Eye } from 'lucide-react'
import type { JobOrder, JobOrderDocument } from '@/types'
import { Card, EmptyState } from '@/components/ui/primitives'
import { DrawingViewer } from '@/components/common/DrawingViewer'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDateTime } from '@/lib/format'
import { validateDrawing, BUCKET_DRAWINGS } from '@/lib/api/storage'
import { useJobDocuments, useUploadJobDrawing } from '../hooks/useProduction'

export function JobDrawingsPanel({ job, canUpload }: { job: JobOrder; canUpload: boolean }) {
  const { data: docs = [], isLoading, isError, error } = useJobDocuments(job.id)
  const upload = useUploadJobDrawing()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<JobOrderDocument | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    const err = validateDrawing(file)
    if (err) {
      toast.error(err)
      return
    }
    try {
      await upload.mutateAsync({ job, file })
      toast.success('Drawing uploaded')
    } catch (ex) {
      toast.error(toUserMessage(ex))
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Part Drawings</h3>
        {canUpload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={onPick}
            />
            <button
              className="btn-secondary btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
            >
              <Upload className="mr-1 h-4 w-4" />
              {upload.isPending ? 'Uploading…' : 'Upload drawing'}
            </button>
          </>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading drawings…</p>}
      {isError && <p className="text-sm text-red-600">{toUserMessage(error)}</p>}
      {!isLoading && !isError && docs.length === 0 && (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No drawings yet"
          description={
            canUpload ? 'Upload a PDF, PNG or JPG drawing for this job.' : 'No drawings uploaded.'
          }
        />
      )}

      {docs.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">
                  {d.fileName} <span className="text-2xs text-slate-400">v{d.version}</span>
                  {!d.isActive && (
                    <span className="ml-1 text-2xs text-slate-400">(superseded)</span>
                  )}
                </p>
                <p className="text-2xs text-slate-500">
                  {d.mime} · {fmtDateTime(d.uploadedAt)}
                  {d.uploadedBy ? ` · ${d.uploadedBy}` : ''}
                </p>
              </div>
              <button className="btn-ghost btn-sm" onClick={() => setView(d)}>
                <Eye className="mr-1 h-4 w-4" />
                View
              </button>
            </li>
          ))}
        </ul>
      )}

      {view && (
        <DrawingViewer
          open={!!view}
          onClose={() => setView(null)}
          bucket={BUCKET_DRAWINGS}
          path={view.storagePath}
          fileName={view.fileName}
          mime={view.mime}
        />
      )}
    </Card>
  )
}
