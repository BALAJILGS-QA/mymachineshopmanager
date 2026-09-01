'use client'

// Framework-agnostic navigation link for SHARED portal pages.
//
// Portal page components (DashboardPage, etc.) are business logic reused by both
// the Vite/TanStack app and the Next.js app during the migration. Rather than
// import a router-specific `Link` (which differs between the two), they render
// `<AppLink to=... />`, and each app injects its own implementation via
// `AppLinkProvider`: the Vite root provides a TanStack-Router adapter, the Next
// root a next/link adapter. This keeps a single source for the pages with zero
// router coupling. (The `'use client'` directive is a no-op under Vite/esbuild.)

import { createContext, useContext, type ComponentType, type ReactNode } from 'react'

export interface AppLinkProps {
  to: string
  className?: string
  children?: ReactNode
  onClick?: () => void
  title?: string
  'aria-label'?: string
}

const AppLinkContext = createContext<ComponentType<AppLinkProps> | null>(null)

export const AppLinkProvider = AppLinkContext.Provider

export function AppLink(props: AppLinkProps) {
  const Impl = useContext(AppLinkContext)
  if (!Impl) throw new Error('AppLink must be used within an AppLinkProvider')
  return <Impl {...props} />
}
