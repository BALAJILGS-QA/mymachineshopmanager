import { createFileRoute, Outlet, Navigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/auth'
import { AppShell } from '@/components/layout/AppShell'

// The authenticated management portal. Rendered client-only (`ssr: false`) so
// Supabase-session, localStorage, chart and PDF code never runs on the server.
// Gates on auth (the store hydration that the old App.tsx Portal did is gone —
// pages read Supabase directly through TanStack Query, so there is nothing to
// hydrate).
export const Route = createFileRoute('/app')({
  ssr: false,
  component: AppLayout,
  // Preserve the old behaviour: unknown /app/* paths redirect to the dashboard.
  notFoundComponent: () => <Navigate to="/app" replace />,
})

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="animate-spin text-brand-600" size={28} />
      <p className="text-sm">{label}</p>
    </div>
  )
}

function AppLayout() {
  const { session, loading } = useAuth()

  if (loading) return <FullScreenLoader label="Starting…" />
  if (!session) return <Navigate to="/" replace />

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
