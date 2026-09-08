import { type Page, expect } from '@playwright/test'

// QA-Orchestra — navigation actions. Modules are keyed by their route (the
// canonical id used in the module registry). Navigate by route for reliability;
// the sidebar-label helper exists for tests that assert the menu itself.

/** Go directly to a module route (e.g. '/app/invoices') and wait for the shell. */
export async function gotoModule(page: Page, route: string): Promise<void> {
  await page.goto(route)
  await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 20_000 })
}

/** Click a sidebar link by its exact label within the navigation region. */
export async function navByLabel(page: Page, label: string): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click()
}

/** Assert the page heading (h1/h2) matches the expected module title. */
export async function expectHeading(page: Page, name: string | RegExp): Promise<void> {
  await expect(page.getByRole('heading', { name }).first()).toBeVisible({ timeout: 20_000 })
}

/** True if a client-side crash rendered the Next error boundary. */
export async function hasClientCrash(page: Page): Promise<boolean> {
  return (await page.locator('#__next_error__').count()) > 0
}
