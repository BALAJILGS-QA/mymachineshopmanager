import { type Page, type Locator, expect } from '@playwright/test'

// QA-Orchestra — interactions for the shared DataTable / list screens
// (src/components/common/DataTable.tsx renders a ResponsiveTable + EmptyState).
// These helpers are DOM-shape tolerant so they work across list pages.

/** The primary data table on the page (first <table>). */
export function table(page: Page): Locator {
  return page.locator('table').first()
}

/** All body rows of the primary table. */
export function rows(page: Page): Locator {
  return table(page).locator('tbody tr')
}

/** Number of data rows currently rendered. */
export async function rowCount(page: Page): Promise<number> {
  if (await isEmptyState(page)) return 0
  return rows(page).count()
}

/** A row containing the given text (e.g. an invoice number). */
export function rowByText(page: Page, text: string | RegExp): Locator {
  return rows(page).filter({ hasText: text }).first()
}

/** True when the list is showing its empty-state placeholder, not a table. */
export async function isEmptyState(page: Page): Promise<boolean> {
  if ((await table(page).count()) === 0) return true
  return (await rows(page).count()) === 0
}

/** Type into the page search box, if the list exposes one. */
export async function search(page: Page, term: string): Promise<void> {
  const box = page
    .getByPlaceholder(/search/i)
    .or(page.getByRole('searchbox'))
    .first()
  await box.fill(term)
  await page.waitForTimeout(300) // debounce
}

/** Assert a row with the given text is present. */
export async function expectRow(page: Page, text: string | RegExp): Promise<void> {
  await expect(rowByText(page, text)).toBeVisible({ timeout: 15_000 })
}
