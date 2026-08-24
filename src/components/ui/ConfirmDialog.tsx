import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

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
  const [state, setState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null)

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
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? 'Please confirm'}
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => close(false)}>
              Cancel
            </button>
            <button
              className={state?.danger ? 'btn-danger' : 'btn-primary'}
              onClick={() => close(true)}
            >
              {state?.confirmLabel ?? 'Confirm'}
            </button>
          </>
        }
      >
        <div className="flex gap-3">
          {state?.danger && (
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={20} />
          )}
          <p className="text-sm text-slate-600">{state?.message}</p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}
