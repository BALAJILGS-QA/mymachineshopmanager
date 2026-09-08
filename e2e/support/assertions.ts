import { type Page, expect } from '@playwright/test'

// QA-Orchestra — shared verification methods (toasts, network, page health).

/** Assert a Sonner toast with the given text appeared. */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(
    page.locator('[data-sonner-toast], [role="status"]').filter({ hasText: text }).first(),
  ).toBeVisible({ timeout: 10_000 })
}

/** Assert the page rendered without a client-side crash and shows content. */
export async function expectHealthy(page: Page): Promise<void> {
  await expect(page.locator('#__next_error__')).toHaveCount(0)
  await expect(page.locator('main, [role="main"]').first()).toBeVisible()
}

/** Assert no failed (>=400) XHR/fetch happened during the given action. */
export async function expectNoFailedRequests(
  page: Page,
  action: () => Promise<void>,
): Promise<void> {
  const failures: string[] = []
  const onResp = (r: import('@playwright/test').Response) => {
    if (r.status() >= 400 && /supabase|\/rest\/|\/rpc\/|\/api\//.test(r.url()))
      failures.push(`${r.status()} ${r.url()}`)
  }
  page.on('response', onResp)
  try {
    await action()
    await page.waitForTimeout(500)
  } finally {
    page.off('response', onResp)
  }
  expect(failures, `unexpected failed requests:\n${failures.join('\n')}`).toHaveLength(0)
}
