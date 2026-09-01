import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { AlertTriangle } from 'lucide-react'

// `useConfirm()` promise API preserved; internals now sit on Radix AlertDialog
// (role=alertdialog, focus moves into the dialog, Escape cancels, focus returns
// to the trigger). Buttons keep the app's .btn classes so confirm dialogs match
// the surrounding screens.

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(
    null,
  )

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve })
    })
  }, [])

  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialogPrimitive.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogPrimitive.Portal>
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <AlertDialogPrimitive.Overlay className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
            <AlertDialogPrimitive.Content className="relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-dialog outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:rounded-2xl">
              <div className="border-b border-slate-100 px-5 py-3.5">
                <AlertDialogPrimitive.Title className="text-sm font-semibold text-slate-900">
                  {state?.title ?? 'Please confirm'}
                </AlertDialogPrimitive.Title>
              </div>
              <AlertDialogPrimitive.Description asChild>
                <div className="flex gap-3 px-5 py-4">
                  {state?.danger && (
                    <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={20} />
                  )}
                  <p className="text-sm text-slate-600">{state?.message}</p>
                </div>
              </AlertDialogPrimitive.Description>
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
                <AlertDialogPrimitive.Cancel asChild>
                  <button className="btn-secondary" onClick={() => close(false)}>
                    Cancel
                  </button>
                </AlertDialogPrimitive.Cancel>
                <AlertDialogPrimitive.Action asChild>
                  <button
                    className={state?.danger ? 'btn-danger' : 'btn-primary'}
                    onClick={() => close(true)}
                  >
                    {state?.confirmLabel ?? 'Confirm'}
                  </button>
                </AlertDialogPrimitive.Action>
              </div>
            </AlertDialogPrimitive.Content>
          </div>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </ConfirmContext.Provider>
  )
}
