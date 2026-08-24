import { test, expect, type Page } from '@playwright/test'

// Validates the dashboard company filter end-to-end against imported data.
// Rounding-robust: checks partitioning (sum of companies == all) and ordering.
const EMAIL = process.env.APP_EMAIL || 'admin@sreebalajiindustries.com'
const PASS = process.env.APP_PASS || 'Balaji@2026'

async function login(page: Page) {
  await page.goto('/')
  const email = page.getByPlaceholder('you@example.com')
  if (!(await email.isVisible().catch(() => false))) test.skip(true, 'not a Supabase build')
  await email.fill(EMAIL)
  await page.getByPlaceholder('••••••••').fill(PASS)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 })
}

test('dashboard company filter partitions KPIs correctly', async ({ page }) => {
  await login(page)

  const unpaidCard = page.getByRole('link').filter({ hasText: 'Pending Payments' })
  const filter = page.getByLabel('Filter dashboard by company')

  async function readUnpaid(): Promise<number> {
    const t = await unpaidCard.innerText()
    return Number(t.replace(/[^\d.]/g, ''))
  }
  async function select(label: string) {
    await filter.selectOption({ label })
    await page.waitForTimeout(400)
  }

  await select('All companies')
  const all = await readUnpaid()
  expect(all).toBeGreaterThan(0)

  await select('Flowra Global')
  const flowra = await readUnpaid()
  await expect(unpaidCard).not.toContainText(String(Math.round(all))) // value changed

  await select('Vahinie Engineering')
  const vahinie = await readUnpaid()

  await select('Nirmal Pumps')
  const nirmal = await readUnpaid()

  // Each company is a strict subset, and they partition the whole.
  expect(flowra).toBeGreaterThan(vahinie)
  expect(vahinie).toBeGreaterThan(nirmal)
  expect(nirmal).toBeGreaterThan(0)
  expect(Math.abs(all - (flowra + vahinie + nirmal))).toBeLessThan(50)

  // New chart set + records present under a company scope.
  await expect(page.getByText('Invoices raised vs Payments received (6 months)')).toBeVisible()
  await expect(page.getByText('Cash flow: Payments vs Expenses (6 months)')).toBeVisible()
  await expect(page.getByText('Priority jobs')).toBeVisible()
})
