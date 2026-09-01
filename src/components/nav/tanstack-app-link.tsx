import { useCallback, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { AppNavProvider, type AppLinkProps } from './app-link'

// Vite/TanStack adapter for AppLink. Provided at the Vite app root (__root.tsx)
// via <AppLinkProvider value={TanStackAppLink}>. Only imported by the Vite graph.
export function TanStackAppLink({ to, ...rest }: AppLinkProps) {
  // `to` is a runtime string path; TanStack's typed `to` is cast away here.
  return <Link to={to as never} {...rest} />
}

// Bridges TanStack's useNavigate into the framework-agnostic AppNavProvider.
// Mounted inside the router tree in __root.tsx.
export function TanStackNavBridge({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const nav = useCallback(
    (to: string, opts?: { replace?: boolean }) =>
      navigate({ to: to as never, replace: opts?.replace }),
    [navigate],
  )
  return <AppNavProvider value={nav}>{children}</AppNavProvider>
}
