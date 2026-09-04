'use client'

import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

// Light-only app — no next-themes indirection. Styled with the design-system
// tokens so toasts match cards/dialogs. Per-type variants render as solid
// status colours with white text (success=green, error=red, warning=orange).
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast rounded-md border-0 shadow-lg',
          title: 'group-[.toast]:text-white',
          description: 'group-[.toast]:text-white/90',
          closeButton: 'group-[.toast]:text-white group-[.toast]:border-white/30',
          actionButton: 'group-[.toast]:bg-white/20 group-[.toast]:text-white',
          cancelButton: 'group-[.toast]:bg-white/10 group-[.toast]:text-white',
          // Solid status backgrounds; `!` beats Sonner's default type tints.
          success: '!bg-green-600 !text-white [&_[data-icon]]:!text-white',
          error: '!bg-red-600 !text-white [&_[data-icon]]:!text-white',
          warning: '!bg-[#ea580c] !text-white [&_[data-icon]]:!text-white',
          info: '!bg-charcoal-700 !text-white [&_[data-icon]]:!text-white',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
