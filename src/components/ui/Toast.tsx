import { createContext, useContext, type ReactNode } from 'react'
import { toast as sonnerToast } from 'sonner'
import { Toaster } from './shadcn/sonner'

// Toast API preserved from the original hand-written implementation; internals
// now delegate to Sonner (design-system toasts: stacking, swipe-dismiss,
// accessible live region). Call sites keep using `useToast().success/error/info`.

interface ToastApi {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const api: ToastApi = {
  success: (m) => sonnerToast.success(m),
  error: (m) => sonnerToast.error(m),
  info: (m) => sonnerToast.info(m),
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Bottom-centre position preserved from the previous custom toaster. */}
      <Toaster position="bottom-center" duration={4000} closeButton />
    </ToastContext.Provider>
  )
}
