import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

// Flat config (ESLint 9). Type-aware linting is intentionally NOT enabled yet —
// `tsc --noEmit` (npm run typecheck) already covers type errors, and the
// non-type-checked ruleset keeps lint fast for the pre-commit hook.
export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
      'tailwind.config.js',
      'postcss.config.js',
      'eslint.config.js',
      'src/vite-env.d.ts',
      // `tsc -b` composite build artifacts (already gitignored)
      'vite.config.js',
      'vite.config.d.ts',
      // Generated build output (all gitignored) — never lint these.
      '.next',
      'next-env.d.ts',
      '.output',
      '.tanstack',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'warn',
    },
  },
  // Node-side files (build scripts, e2e specs, config) — allow node globals and
  // console output.
  {
    files: [
      'scripts/**/*.mjs',
      'e2e/**/*.ts',
      'vite.config.ts',
      'vitest.config.ts',
      'next.config.mjs',
      'playwright*.config.ts',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  // The logger is the ONE place console.* is allowed by design.
  {
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
)
