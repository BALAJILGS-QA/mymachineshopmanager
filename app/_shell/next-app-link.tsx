'use client'

import NextLink from 'next/link'
import type { AppLinkProps } from '@/components/nav/app-link'

// Next.js adapter for AppLink. Provided at the Next app root (app/providers.tsx)
// via <AppLinkProvider value={NextAppLink}>. Only imported by the Next graph.
export function NextAppLink({ to, children, ...rest }: AppLinkProps) {
  return (
    <NextLink href={to} {...rest}>
      {children}
    </NextLink>
  )
}
