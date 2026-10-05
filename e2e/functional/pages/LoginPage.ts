import { type Page, type Locator, expect } from '@playwright/test'

// Page object for the dedicated sign-in page (/login — app/login/login-form.tsx):
// #loginId + #password, submit labelled "Login".
export class LoginPage {
  readonly page: Page
  readonly loginId: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly terms: Locator

  constructor(page: Page) {
    this.page = page
    this.loginId = page.locator('#loginId')
    this.password = page.locator('#password')
    this.submit = page.getByRole('button', { name: /login/i })
    this.terms = page.getByRole('link', { name: /terms & conditions/i })
  }

  async goto(): Promise<void> {
    await this.page.goto('/login')
    await expect(this.loginId).toBeVisible()
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.loginId.fill(email)
    await this.password.fill(password)
    await this.submit.click()
  }

  /** Successful sign-in lands in the portal on the Dashboard. */
  async expectSignedIn(): Promise<void> {
    await this.page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 })
    await expect(this.page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  }
}
