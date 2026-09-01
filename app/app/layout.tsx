'use client'

// Next.js port of src/routes/app/route.tsx — the authenticated portal layout.
// Client component (equivalent to the Vite route's `ssr: false`): gates on auth
// and wraps pages in the ported AppShell. Browser-only portal code (Supabase
// session, localStorage, charts, PDF) therefore only runs on the client.
// `@/index.css` is imported here so portal pages get the app base styles +
// component classes (.card/.input/.btn/.label), matching the Vite app.

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/auth'
import { AppShell } from '../_shell/app-shell'
import '@/index.css'

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="animate-spin text-brand-600" size={28} />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !session) router.replace('/')
  }, [loading, session, router])

  if (loading) return <FullScreenLoader label="Starting…" />
  if (!session) return <FullScreenLoader label="Redirecting…" />

  return <AppShell>{children}</AppShell>
}
