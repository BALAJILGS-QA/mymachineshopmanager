import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE, QA } from './e2e/support/credentials'

// QA-Orchestra suite — generated specs in e2e/generated/ run against the target
// (live production by default) as the authenticated QA super-admin.
//
// SAFETY: destructive create/update/delete specs are tagged @destructive and are
// EXCLUDED unless QA_ALLOW_DESTRUCTIVE=1. The default run is read/nav/validation
// only, safe against production data.
const allowDestructive = process.env.QA_ALLOW_DESTRUCTIVE === '1'

export default defineConfig({
  testDir: './e2e/generated',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1, // absorb transient network/data-load races against the live backend
  reporter: [
    ['list'],
    ['html', { outputFolder: 'qa/reports/html', open: 'never' }],
    ['json', { outputFile: 'qa/reports/results.json' }],
  ],
  timeout: 45_000,
  grepInvert: allowDestructive ? undefined : /@destructive/,
  use: {
    baseURL: QA.baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testDir: './e2e/support', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],
})
