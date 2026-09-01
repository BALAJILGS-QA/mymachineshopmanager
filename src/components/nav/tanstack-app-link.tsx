import { Link } from '@tanstack/react-router'
import type { AppLinkProps } from './app-link'

// Vite/TanStack adapter for AppLink. Provided at the Vite app root (__root.tsx)
// via <AppLinkProvider value={TanStackAppLink}>. Only imported by the Vite graph.
export function TanStackAppLink({ to, ...rest }: AppLinkProps) {
  // `to` is a runtime string path; TanStack's typed `to` is cast away here.
  return <Link to={to as never} {...rest} />
}
