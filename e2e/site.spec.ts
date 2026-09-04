import { test, expect } from '@playwright/test'

// Public marketing site + SEO. No auth, so this runs in any build mode.

test('landing page renders with merged auth and SEO metadata', async ({ page }) => {
  await page.goto('/')
  // Landing title comes from BRAND.product (currently "Machine Shop Management").
  // (Assertion updated from the stale "Sree Balaji Industries" brand name.)
  await expect(page).toHaveTitle(/Machine Shop Management/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/traceability/i)
  // Login is merged into the landing: the auth card and toggle are present.
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign Up', exact: true })).toBeVisible()

  const desc = page.locator('meta[name="description"]')
  // Assertions aligned to current BRAND copy (was stale "CNC"/"machining").
  await expect(desc).toHaveAttribute('content', /machine shop/i)
  await expect(page.locator('meta[name="keywords"]')).toHaveAttribute('content', /CNC/i)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /mymachineshopmanager\.vercel\.app/,
  )
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
  await expect(page.locator('script#route-jsonld')).toHaveCount(1)
})

test('blog list and post navigation', async ({ page }) => {
  await page.goto('/blog')
  await expect(page.getByRole('heading', { name: 'The Workshop Journal' })).toBeVisible()

  const firstPost = page.getByRole('heading', {
    name: 'A Complete Guide to CNC Machining Services in 2026',
  })
  await expect(firstPost).toBeVisible()
  await firstPost.click()

  await expect(page).toHaveURL(/\/blog\/complete-guide/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Complete Guide to CNC/)
  await expect(page.locator('script#route-jsonld')).toHaveCount(1)
  await expect(page).toHaveTitle(/Complete Guide/)
})

test('robots.txt and sitemap.xml are served', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  expect(await robots.text()).toContain('Sitemap:')

  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  expect(await sitemap.text()).toContain('<urlset')
})
