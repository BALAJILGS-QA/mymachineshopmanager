import { test as base, expect, type Page } from '@playwright/test'
import { ENV } from './support/env'
import { makeTestUser, type TestUser } from './support/test-user'
import { deleteUser } from './support/admin-backend'
import { LoginPage } from './pages/LoginPage'

// Fixtures for the functional suite:
//   • testUser      — a unique applicant per test, torn down from the backend after.
//   • superAdminPage— a page in its OWN browser context, signed in as the super
//                     admin (separate session from the applicant).
type Fixtures = {
  testUser: TestUser
  superAdminPage: Page
}

// Note: Playwright's fixture value callback is named `provide` (not the
// conventional `use`) so the react-hooks lint rule doesn't mistake it for React's
// `use` hook.
export const test = base.extend<Fixtures>({
  // Playwright requires the first fixture arg to be an object-destructuring
  // pattern; this fixture has no dependencies, hence the empty pattern.
  // eslint-disable-next-line no-empty-pattern
  testUser: async ({}, provide) => {
    const user = makeTestUser()
    await provide(user)
    // Keep the shared prod backend clean regardless of assertion outcome.
    await deleteUser(user.email)
  },

  superAdminPage: async ({ browser }, provide) => {
    // Manually-created contexts don't inherit the config baseURL — pass it in.
    const context = await browser.newContext({ baseURL: ENV.baseURL })
    const page = await context.newPage()
    const login = new LoginPage(page)
    await login.goto()
    await login.signIn(ENV.superAdmin.email, ENV.superAdmin.password)
    await login.expectSignedIn()
    await provide(page)
    await context.close()
  },
})

export { expect }
