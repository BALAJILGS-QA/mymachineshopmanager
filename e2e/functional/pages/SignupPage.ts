import { type Page, type Locator, expect } from '@playwright/test'
import type { TestUser } from '../support/test-user'

// Page object for the public registration page (/signup). Fields use aria-labels
// (app/signup/signup-form.tsx), so getByLabel is the stable locator.
export class SignupPage {
  readonly page: Page
  readonly fullName: Locator
  readonly companyName: Locator
  readonly phone: Locator
  readonly email: Locator
  readonly gstin: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly submittedHeading: Locator

  constructor(page: Page) {
    this.page = page
    this.fullName = page.getByLabel('Full Name')
    this.companyName = page.getByLabel('Company Name')
    this.phone = page.getByLabel('Phone')
    this.email = page.getByLabel('Email')
    this.gstin = page.getByLabel('GSTIN')
    this.password = page.getByLabel('Password', { exact: true })
    this.submit = page.getByRole('button', { name: 'Create account' })
    this.submittedHeading = page.getByRole('heading', { name: 'Registration submitted' })
  }

  async goto(): Promise<void> {
    await this.page.goto('/signup')
    await expect(this.email, 'signup form should render (Supabase build)').toBeVisible()
  }

  async register(user: TestUser): Promise<void> {
    await this.fullName.fill(user.fullName)
    await this.companyName.fill(user.companyName)
    await this.phone.fill(user.phone)
    await this.email.fill(user.email)
    if (user.gstin) await this.gstin.fill(user.gstin)
    await this.password.fill(user.password)
    await this.submit.click()
  }

  /** The app confirms a pending registration (does NOT sign the user in). */
  async expectPendingConfirmation(): Promise<void> {
    await expect(this.submittedHeading).toBeVisible()
    await expect(this.page.getByText(/pending approval/i)).toBeVisible()
  }
}
