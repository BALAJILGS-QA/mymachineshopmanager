import { defineConfig, devices } from '@playwright/test'

// TanStack Start SSR build is served by the Nitro node server
// (`npm run start` → node .output/server/index.mjs), not `vite preview`.
// PORT is passed via `env` so it works cross-platform.
const PORT = process.env.E2E_PORT || '4173'

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
    // `vite preview` serves the TanStack Start SSR build (public pages
    // server-rendered, /app client-only).
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
