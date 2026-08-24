import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './features/auth/auth'
import { LoginPage } from './features/auth/LoginPage'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { JobsPage } from './features/jobs/JobsPage'
import { ProductionPage } from './features/production/ProductionPage'
import { MaterialsPage } from './features/materials/MaterialsPage'
import { InvoicesPage } from './features/invoices/InvoicesPage'
import { InvoicePrintPage } from './features/invoices/InvoicePrintPage'
import { PaymentsPage } from './features/payments/PaymentsPage'
import { ExpensesPage } from './features/expenses/ExpensesPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { CompaniesPage } from './features/companies/CompaniesPage'
import { SettingsPage } from './features/settings/SettingsPage'

export default function App() {
  const { session } = useAuth()

  if (!session) return <LoginPage />

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/production" element={<ProductionPage />} />
        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id/print" element={<InvoicePrintPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
