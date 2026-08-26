import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit/integration tests (Vitest). Playwright E2E lives in e2e/ and is run
// separately via `npm run test:e2e` — excluded here so the two runners don't
// collide.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      include: ['src/data/**', 'src/lib/**'],
      reporter: ['text', 'html'],
    },
  },
})
