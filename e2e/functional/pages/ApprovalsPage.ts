import { type Page, type Locator, expect } from '@playwright/test'

// Page object for the super-admin User Approvals screen (/app/approvals).
// Drives the real approval action the product exposes to the admin.
export class ApprovalsPage {
  readonly page: Page
  readonly heading: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: 'User Approvals' })
  }

  async goto(): Promise<void> {
    await this.page.goto('/app/approvals')
    await expect(this.heading, 'super admin should see the Approvals screen').toBeVisible()
  }

  private row(email: string): Locator {
    // Default filter is "Pending", where a fresh registration appears.
    return this.page.getByRole('row').filter({ hasText: email })
  }

  /** Approve the registration for `email`. Waits for the mutation to round-trip —
   *  on success the user leaves the default "Pending" filter — so callers can
   *  safely reload afterwards without aborting the in-flight request. */
  async approve(email: string): Promise<void> {
    const row = this.row(email)
    await expect(row, `pending registration for ${email} should be listed`).toBeVisible()
    await row.getByRole('button', { name: /approve/i }).click()
    await expect(this.row(email), 'approved user should leave the Pending filter').toHaveCount(0, {
      timeout: 20_000,
    })
  }

  /** The row should reflect an approved account on a Free trial subscription.
   *  Reload first so the subscription column reflects the just-provisioned trial
   *  (a fresh page load refetches the super-admin subscription view). */
  async expectApprovedWithTrial(email: string): Promise<void> {
    await this.page.reload()
    await expect(this.heading).toBeVisible()
    await this.page.getByRole('button', { name: 'All', exact: true }).click()
    const row = this.row(email)
    await expect(row).toContainText(/approved/i)
    await expect(row).toContainText(/free trial/i)
  }
}
