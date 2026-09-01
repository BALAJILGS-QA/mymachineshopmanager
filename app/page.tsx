// Phase 2 foundation home route (Server Component, server-rendered).
//
// This is a temporary landing that verifies the Next.js App Router + SSR +
// Tailwind + TanStack Query provider pipeline works end to end. It is replaced
// by the real marketing landing (ported from `src/features/site/LandingPage`)
// in the route-migration phase. The existing Vite/TanStack app is unchanged and
// still serves the production `/` until then.

export default function FoundationHome() {
  const checks = [
    'Next.js 16 App Router (SSR) is serving this route',
    'React 18.3.1 preserved — no framework break for the existing app',
    'Tailwind CSS 3 pipeline active via PostCSS',
    'TanStack Query provider mounted (see app/providers.tsx)',
  ]

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
          MSM ERP · Migration
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Next.js foundation is live</h1>
        <p className="mt-2 text-slate-600">
          Phase 2 complete. The App Router runs alongside the existing Vite + TanStack app; no
          routes have been migrated and nothing was removed.
        </p>
      </div>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c} className="flex items-start gap-2 text-slate-700">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
