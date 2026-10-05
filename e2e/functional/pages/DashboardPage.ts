import { type Page, type Locator, expect } from '@playwright/test'

// Page object for the portal dashboard (/app — src/features/dashboard/DashboardPage.tsx).
// Focused on the empty-data (fresh tenant) assertions. KPI tiles (BigStat) and
// financial rows (SummaryRow) both render as links, so we scope by the link's text.
export class DashboardPage {
  readonly page: Page
  readonly heading: Locator
  readonly companyFilter: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: 'Dashboard' })
    this.companyFilter = page.getByLabel('Filter dashboard by company')
  }

  async goto(): Promise<void> {
    await this.page.goto('/app')
    await expect(this.heading).toBeVisible()
  }

  /** The "Shop-floor activity" KPI card — scoping here disambiguates labels that
   *  also appear in the workflow stepper / charts (e.g. "Dispatched"). */
  private activityPanel(): Locator {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByRole('heading', { name: 'Shop-floor activity', exact: true }) })
      .filter({ has: this.page.getByText('Open Jobs', { exact: true }) })
      .last()
  }

  /** BigStat KPI value — the first span inside the tile link is the number. */
  private async bigStat(label: string): Promise<string> {
    const tile = this.activityPanel().getByRole('link').filter({ hasText: label }).first()
    await expect(tile, `KPI "${label}" should render`).toBeVisible()
    return (await tile.locator('span').first().innerText()).trim()
  }

  private financialRow(label: string): Locator {
    return this.page.getByRole('link').filter({ hasText: label }).first()
  }

  /** A brand-new tenant has no customers → the only filter option is "All companies". */
  async expectNoCompanies(): Promise<void> {
    const options = this.companyFilter.locator('option')
    await expect(options).toHaveCount(1)
    await expect(options.first()).toHaveText(/all companies/i)
  }

  /** Operational + financial KPIs are all zero for an empty tenant. */
  async expectEmptyKpis(): Promise<void> {
    expect(await this.bigStat('Open Jobs'), 'Open Jobs').toBe('0')
    expect(await this.bigStat('In Production'), 'In Production').toBe('0')
    expect(await this.bigStat('Dispatched'), 'Dispatched').toBe('0')
    await expect(this.financialRow('Pending payments')).toContainText('₹0.00')
    await expect(this.financialRow('Payments (month)')).toContainText('₹0.00')
  }

  /** Charts render their empty-state copy rather than data. */
  async expectEmptyCharts(): Promise<void> {
    await expect(this.page.getByText('No expenses this month')).toBeVisible()
    await expect(this.page.getByText('No material issues in this period')).toBeVisible()
  }
}
