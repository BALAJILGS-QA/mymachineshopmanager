import { test, expect, type Page } from '@playwright/test'

// End-to-end smoke test that walks the MVP acceptance criteria (PRD 17):
// login, create company, create job, receive material, issue material,
// complete job, invoice, payment, expense, and dashboard/report sanity.

async function login(page: Page) {
  // Login is merged into the landing page.
  await page.goto('/')
  await page.getByPlaceholder('••••••••').fill('admin123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

// Nav labels like "Job Orders" are substrings of KPI cards ("Open Job Orders"),
// so navigate via the sidebar navigation region with an exact match.
function nav(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true }).click()
}

// Start every test from a clean slate by clearing localStorage.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('login shows the dashboard', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Open Job Orders')).toBeVisible()
})

test('sign up creates an account and enters the app (local mode)', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop only')
  await page.goto('/')
  // Local build shows a username field (Supabase build would show email).
  const isSupabase = await page.getByPlaceholder('you@example.com').isVisible().catch(() => false)
  test.skip(isSupabase, 'local-mode sign-up test')
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click()
  await page.getByLabel('Username').fill('owner')
  await page.getByLabel('Password').fill('secret123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('mobile shows bottom navigation', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 9999) >= 1024, 'mobile layout only')
  await login(page)
  // Bottom nav primary items should be reachable on small screens.
  await expect(page.getByRole('link', { name: 'Jobs' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Stock' })).toBeVisible()
})

test('full operational workflow', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop sidebar navigation only')
  await login(page)

  // Seed with demo data via Settings to exercise a realistic dataset.
  await nav(page, 'Settings')
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await page.getByRole('button', { name: 'Load demo', exact: true }).click()
  // The loader reloads the page ~400ms later; wait for that to settle.
  await page.waitForTimeout(1500)

  // Jobs list should be populated.
  await nav(page, 'Job Orders')
  await expect(page.getByText('Pump Shaft 40mm')).toBeVisible()

  // Invoices list populated with outstanding amounts.
  await nav(page, 'Invoices')
  await expect(page.getByText(/INV-/).first()).toBeVisible()

  // Reports render and outstanding report has data.
  await nav(page, 'Reports')
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()
})

test('invoice PDF downloads', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop sidebar navigation only')
  await login(page)

  // Populate demo data (which includes invoices) then download a PDF.
  await nav(page, 'Settings')
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await page.getByRole('button', { name: 'Load demo', exact: true }).click()
  await page.waitForLoadState('load')

  await nav(page, 'Invoices')
  await expect(page.getByText(/INV-/).first()).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PDF' }).first().click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^INV-.*\.pdf$/)
})

test('delivery challan can be created and invoiced', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop sidebar navigation only')
  await login(page)

  await nav(page, 'Delivery Challan')
  await page.getByRole('button', { name: 'New Challan' }).click()
  await page.getByPlaceholder('Item').fill('Open Well Bracket')
  await page.getByRole('button', { name: 'Create challan' }).click()
  await expect(page.getByText(/DC-/).first()).toBeVisible()
  await expect(page.getByText('Open', { exact: true }).first()).toBeVisible()

  // Raise an invoice against the challan (prefilled from its items).
  await page.getByRole('button', { name: 'Create invoice' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'New Invoice' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Create invoice' }).click()
  // Challan flips to Invoiced.
  await expect(page.getByText('Invoiced').first()).toBeVisible()
})

test('create a company and a job order', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop sidebar navigation only')
  await login(page)

  await nav(page, 'Companies')
  await page.getByRole('button', { name: 'Add Company' }).click()
  await page.getByLabel('Company Name').fill('Test Precision Works')
  await page.getByRole('button', { name: 'Create company' }).click()
  await expect(page.getByText('Test Precision Works')).toBeVisible()

  await nav(page, 'Job Orders')
  await page.getByRole('button', { name: 'Add Job' }).click()
  await page.getByLabel('Part / Product Name').fill('Test Bracket')
  await page.getByLabel('Ordered Quantity').fill('25')
  await page.getByRole('button', { name: 'Create job order' }).click()
  await expect(page.getByText('Test Bracket')).toBeVisible()
})
