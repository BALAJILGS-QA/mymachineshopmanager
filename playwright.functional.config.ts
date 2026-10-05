import { defineConfig, devices } from '@playwright/test'

// Functional E2E suite for the MSM onboarding lifecycle (signup → admin approval →
// signin → empty-dashboard verification). Runs against a REAL backend (prod
// Supabase) because the flow exercises real auth, approval RPCs and RLS.
//
// Target: the deployed production app by default (FUNC_BASE_URL to override, e.g.
// http://localhost:3200 when running your own `next start`). Secrets (super-admin
// password, Supabase management token) are read from the environment — see
// e2e/functional/README.md. Nothing privileged is hard-coded.
export default defineConfig({
  testDir: './e2e/functional/tests',
  // Each spec creates a real user in the shared backend, so run serially to keep
  // the super-admin approval queue and teardown deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/functional/report', open: 'never' }]],
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.FUNC_BASE_URL || 'https://mymachineshopmanager.vercel.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
