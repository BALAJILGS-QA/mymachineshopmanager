import { defineConfig, devices } from '@playwright/test'

// Runs specs against the LIVE production site (no local server).
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  timeout: 45_000,
  use: {
    baseURL: 'https://sreebalajiindustries.netlify.app',
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
