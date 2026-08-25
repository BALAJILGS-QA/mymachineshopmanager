import { clsx } from 'clsx'
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react'
import { forwardRef, isValidElement, cloneElement, useId } from 'react'

export function Field({
  label,
  error,
  required,
  hint,
  children,
  className,
}: {
  label?: string
  error?: string
  required?: boolean
  hint?: string
  children: ReactNode
  className?: string
}) {
  const id = useId()
  // Associate the label with the first form control for accessibility so
  // screen readers and getByLabel() resolve it (PRD 12 — accessibility).
  const control =
    isValidElement(children) && !(children as ReactElement).props.id
      ? cloneElement(children as ReactElement, { id })
      : children
  const htmlFor = isValidElement(children)
    ? ((children as ReactElement).props.id ?? id)
    : undefined

  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {control}
      {hint && !error && <p className="mt-1 text-2xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-2xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={clsx('input', className)} {...props} />
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={clsx('input', className)} {...props} />
})

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={clsx('input pr-8', className)} {...props}>
      {children}
    </select>
  )
})

// Each tone carries a ring so the pill keeps a defined edge against white
// cards and coloured rows, and darker text (800) for readable contrast.
const BADGE_TONES: Record<string, string> = {
  slate: 'bg-slate-200 text-slate-800 ring-1 ring-slate-300',
  blue: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300',
  green: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
  amber: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300',
  red: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  violet: 'bg-violet-100 text-violet-800 ring-1 ring-violet-300',
  gray: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
}

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: keyof typeof BADGE_TONES | string
  children: ReactNode
}) {
  return <span className={clsx('chip', BADGE_TONES[tone] ?? BADGE_TONES.slate)}>{children}</span>
}

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={clsx('card', className)}>{children}</div>
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-slate-500">{icon}</div>}
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
