/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Use a dedicated tsconfig so Next's required `jsx: preserve` never touches
    // the root tsconfig that Vite / tsc / Vitest rely on during the parallel
    // migration period.
    tsconfigPath: './tsconfig.next.json',
  },
  // Note: Next 16 removed the built-in `next lint` integration, so there is no
  // `eslint` config key. ESLint runs separately via `npm run lint` (flat config).
}

export default nextConfig
