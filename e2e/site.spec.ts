import { test, expect } from '@playwright/test'

// Public marketing site + SEO. No auth, so this runs in any build mode.

test('landing page renders with SEO metadata and auth CTAs', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Sree Balaji Industries/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/tolerance/i)
  // Sign in / sign up are the primary actions.
  await expect(page.getByRole('link', { name: 'Create Account' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign In' }).first()).toBeVisible()

  const desc = page.locator('meta[name="description"]')
  await expect(desc).toHaveAttribute('content', /CNC/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /sreebalajiindustries/)
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
  // Structured data present.
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
