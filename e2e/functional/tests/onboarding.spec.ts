import { test, expect } from '../fixtures'
import { SignupPage } from '../pages/SignupPage'
import { LoginPage } from '../pages/LoginPage'
import { ApprovalsPage } from '../pages/ApprovalsPage'
import { DashboardPage } from '../pages/DashboardPage'
import { confirmEmail, registryStatus } from '../support/admin-backend'

// MSM onboarding lifecycle — the happy path a new customer travels:
// register → super-admin approves → sign in → land on an (empty) dashboard.
//
// The product behaviour (signup form, approval screen, login, dashboard) is driven
// entirely through the real UI. The only backend touches are test prerequisites a
// human/mailbox would otherwise own: confirming the signup email (this project has
// mailer_autoconfirm = off) and tearing the user down afterwards (fixture).
test.describe('Onboarding lifecycle', () => {
  test('signup → admin approval → signin → empty dashboard', async ({
    page,
    testUser,
    superAdminPage,
  }) => {
    const signup = new SignupPage(page)
    const approvals = new ApprovalsPage(superAdminPage)
    const login = new LoginPage(page)
    const dashboard = new DashboardPage(page)

    await test.step('1. Applicant registers and lands in "pending approval"', async () => {
      await signup.goto()
      await signup.register(testUser)
      await signup.expectPendingConfirmation()
      expect(await registryStatus(testUser.email), 'registry status after signup').toBe('pending')
    })

    await test.step('2. Super admin approves the registration', async () => {
      await approvals.goto()
      await approvals.approve(testUser.email)
      await approvals.expectApprovedWithTrial(testUser.email)
      expect(await registryStatus(testUser.email), 'registry status after approval').toBe(
        'approved',
      )
    })

    await test.step('3. New user signs in with their credentials', async () => {
      // Prerequisite: confirm the signup email (no mailbox in CI).
      await confirmEmail(testUser.email)
      await login.goto()
      await login.signIn(testUser.email, testUser.password)
      await login.expectSignedIn()
    })

    await test.step('4. Dashboard renders correctly with empty data', async () => {
      await dashboard.goto()
      await dashboard.expectNoCompanies()
      await dashboard.expectEmptyKpis()
      await dashboard.expectEmptyCharts()
    })
  })
})
