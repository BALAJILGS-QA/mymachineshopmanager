import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from './features/auth/auth'
import { AppShell } from './components/layout/AppShell'
import { hydrateFromRemote } from './data/store'
import { setSyncErrorHandler } from './data/backend'
import { useToast } from './components/ui/Toast'
import { LandingPage } from './features/site/LandingPage'
import { BlogListPage } from './features/site/BlogListPage'
import { BlogPostPage } from './features/site/BlogPostPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { JobsPage } from './features/jobs/JobsPage'
import { ProductionPage } from './features/production/ProductionPage'
import { MaterialsPage } from './features/materials/MaterialsPage'
import { DeliveriesPage } from './features/deliveries/DeliveriesPage'
import { InvoicesPage } from './features/invoices/InvoicesPage'
import { InvoicePrintPage } from './features/invoices/InvoicePrintPage'
import { PaymentsPage } from './features/payments/PaymentsPage'
import { ExpensesPage } from './features/expenses/ExpensesPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { CompaniesPage } from './features/companies/CompaniesPage'
import { SettingsPage } from './features/settings/SettingsPage'

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="animate-spin text-brand-600" size={28} />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/blog" element={<BlogListPage />} />
      <Route path="/blog/:slug" element={<BlogPostPage />} />
      {/* Login is merged into the landing page. */}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/signup" element={<Navigate to="/" replace />} />
      <Route path="/app/*" element={<Portal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// The authenticated management portal — gates on auth, hydrates the store
// (Supabase mode) then renders the app shell and its routes.
function Portal() {
  const { session, loading, supabaseMode } = useAuth()
  const toast = useToast()
  const [hydrated, setHydrated] = useState(!supabaseMode)

  useEffect(() => {
    setSyncErrorHandler((e) =>
      toast.error(`Cloud sync failed: ${e instanceof Error ? e.message : 'unknown error'}`),
    )
  }, [toast])

  useEffect(() => {
    if (supabaseMode && session && !hydrated) {
      hydrateFromRemote()
        .then(() => setHydrated(true))
        .catch((e) => {
          toast.error(`Could not load data: ${e instanceof Error ? e.message : 'error'}`)
          setHydrated(true)
        })
    }
  }, [supabaseMode, session, hydrated, toast])

  if (loading) return <FullScreenLoader label="Starting…" />
  if (!session) return <Navigate to="/" replace />
  if (!hydrated) return <FullScreenLoader label="Loading your shop data…" />

  return (
    <AppShell>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="production" element={<ProductionPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="deliveries" element={<DeliveriesPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id/print" element={<InvoicePrintPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AppShell>
  )
}
