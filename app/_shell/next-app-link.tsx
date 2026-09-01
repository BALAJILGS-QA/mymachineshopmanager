'use client'

import { useCallback, type ReactNode } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { AppNavProvider, type AppLinkProps } from '@/components/nav/app-link'

// Next.js adapter for AppLink. Provided at the Next app root (app/providers.tsx)
// via <AppLinkProvider value={NextAppLink}>. Only imported by the Next graph.
export function NextAppLink({ to, children, ...rest }: AppLinkProps) {
  return (
    <NextLink href={to} {...rest}>
      {children}
    </NextLink>
  )
}

// Bridges next/navigation's router into the framework-agnostic AppNavProvider.
export function NextNavBridge({ children }: { children: ReactNode }) {
  const router = useRouter()
  const nav = useCallback(
    (to: string, opts?: { replace?: boolean }) =>
      opts?.replace ? router.replace(to) : router.push(to),
    [router],
  )
  return <AppNavProvider value={nav}>{children}</AppNavProvider>
}
