import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { clsx } from 'clsx'

// Modal API preserved (open/onClose/title/size/footer); internals now sit on
// Radix Dialog for a real focus trap, aria-modal semantics, scroll locking and
// Escape handling. Markup/classes match the previous hand-written modal —
// bottom-sheet on mobile, centred card on sm+.
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
}) {
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <DialogPrimitive.Overlay className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={clsx(
              'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-dialog outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:rounded-2xl',
              sizes[size],
            )}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <DialogPrimitive.Title className="text-sm font-semibold text-slate-900">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={18} />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
                {footer}
              </div>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
