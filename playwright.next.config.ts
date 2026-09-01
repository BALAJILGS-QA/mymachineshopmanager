import { defineConfig, devices } from '@playwright/test'

// E2E against the NEXT.JS build (migration Phase 4). The original
// playwright.config.ts still targets the Vite/TanStack build; this config runs
// the SAME specs against `next build && next start` so parity can be compared
// suite-to-suite during the parallel-run period. Replaces the Vite config at
// cleanup.
const PORT = process.env.E2E_PORT || '3200'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run build:next && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
