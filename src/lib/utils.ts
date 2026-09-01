import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui's canonical `cn` helper: clsx for conditional classes + tailwind-merge
// so later Tailwind classes correctly override earlier ones. Used by all shadcn
// components; app code may keep using plain clsx where merging isn't needed.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
