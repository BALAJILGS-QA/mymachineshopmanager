'use client'

// Reusable part-drawing / document viewer. Files live in private Storage; we fetch
// a short-lived signed URL (server-authorized by storage RLS) on open. PDFs render
// in the browser's native viewer (zoom/fit/print built in); images get manual
// zoom / rotate / fit controls. No file is downloaded unless the user chooses to.

import { useEffect, useState } from 'react'
import { Download, Maximize2, RotateCw, ZoomIn, ZoomOut, X } from 'lucide-react'
import { signedUrl } from '@/lib/api/storage'
import { toUserMessage } from '@/lib/api/errors'

export interface DrawingViewerProps {
  open: boolean
  onClose: () => void
  bucket: string
  path: string
  fileName?: string
  mime?: string
}

export function DrawingViewer({ open, onClose, bucket, path, fileName, mime }: DrawingViewerProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotate, setRotate] = useState(0)

  const isPdf = (mime ?? '').includes('pdf') || path.toLowerCase().endsWith('.pdf')

  useEffect(() => {
    if (!open) return
    let active = true
    setUrl(null)
    setError(null)
    setZoom(1)
    setRotate(0)
    signedUrl(bucket, path, 300)
      .then((u) => active && setUrl(u))
      .catch((e) => active && setError(toUserMessage(e)))
    return () => {
      active = false
    }
  }, [open, bucket, path])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/90 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2 text-white">
        <span className="truncate text-sm font-medium">{fileName ?? 'Drawing'}</span>
        <div className="flex items-center gap-1">
          {!isPdf && (
            <>
              <button
                className="btn-ghost btn-sm text-white"
                title="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                className="btn-ghost btn-sm text-white"
                title="Zoom in"
                onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                className="btn-ghost btn-sm text-white"
                title="Fit to screen"
                onClick={() => {
                  setZoom(1)
                  setRotate(0)
                }}
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                className="btn-ghost btn-sm text-white"
                title="Rotate"
                onClick={() => setRotate((r) => (r + 90) % 360)}
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </>
          )}
          {url && (
            <a
              className="btn-ghost btn-sm text-white"
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Open / download"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <button className="btn-ghost btn-sm text-white" title="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {error && <div className="p-6 text-center text-sm text-red-200">{error}</div>}
        {!error && !url && <div className="p-6 text-center text-sm text-white/70">Loading…</div>}
        {url && isPdf && (
          <iframe src={url} title={fileName ?? 'drawing'} className="h-full w-full" />
        )}
        {url && !isPdf && (
          <div className="flex min-h-full items-center justify-center p-4">
            <img
              src={url}
              alt={fileName ?? 'drawing'}
              style={{
                transform: `scale(${zoom}) rotate(${rotate}deg)`,
                transition: 'transform 0.15s',
              }}
              className="max-w-none"
            />
          </div>
        )}
      </div>
    </div>
  )
}
