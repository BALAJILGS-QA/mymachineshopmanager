import { test, expect, type Page } from '@playwright/test'

// Post-migration portal smoke: log in, then visit every /app route via the
// sidebar and assert each renders (an <h1> is shown and the app shell survives).
// This exercises the TanStack Router file routes + the ssr:false auth gate for
// the whole authenticated surface. Runs only against a Supabase build.
const EMAIL = process.env.APP_EMAIL || 'admin@sreebalajiindustries.com'
const PASS = process.env.APP_PASS || 'Balaji@2026'

// Sidebar label -> path. Order mirrors NAV_ITEMS. Approvals is super-admin only.
const ROUTES: { label: string; path: string; superAdmin?: boolean }[] = [
  { label: 'Dashboard', path: '/app' },
  { label: 'Job Orders', path: '/app/jobs' },
  { label: 'Production', path: '/app/production' },
  { label: 'Inventory', path: '/app/materials' },
  { label: 'Delivery Challan', path: '/app/deliveries' },
  { label: 'Invoices', path: '/app/invoices' },
  { label: 'Payments', path: '/app/payments' },
  { label: 'Expenses', path: '/app/expenses' },
  { label: 'Reports', path: '/app/reports' },
  { label: 'Companies', path: '/app/companies' },
  { label: 'User Approvals', path: '/app/approvals', superAdmin: true },
  { label: 'Settings', path: '/app/settings' },
]

async function login(page: Page) {
  await page.goto('/')
  const email = page.getByPlaceholder('you@example.com')
  if (!(await email.isVisible().catch(() => false))) test.skip(true, 'not a Supabase build')
  await email.fill(EMAIL)
  await page.getByPlaceholder('••••••••').fill(PASS)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 })
}

test('every portal route renders under TanStack Router (desktop)', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop sidebar navigation only')
  await login(page)

  const nav = page.getByRole('navigation')
  for (const r of ROUTES) {
    // Match by href (labels can carry a badge count, e.g. "User Approvals 1").
    await nav.locator(`a[href="${r.path}"]`).first().click()
    await expect(page).toHaveURL(new RegExp(`${r.path.replace(/\//g, '\\/')}$`))
    // The page rendered its PageHeader/heading, and the shell (Sign out) survived.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Sign out/i })).toBeVisible()
  }
})

test('deep-linking directly to a portal route works (auth kept)', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, 'desktop only')
  await login(page)
  // Directly navigate (not via sidebar) to confirm the route + gate resolve.
  await page.goto('/app/invoices')
  await expect(page.getByRole('heading', { level: 1, name: 'Invoices' })).toBeVisible({
    timeout: 20000,
  })
})
