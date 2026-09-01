// Cross-runtime PUBLIC env accessor for the migration period.
//
// During the Vite → Next.js migration the codebase is built by BOTH toolchains:
//   • Vite  — exposes `import.meta.env.VITE_*` (statically replaced at build).
//   • Next  — exposes `process.env.NEXT_PUBLIC_*` (inlined for the browser).
//
// Shared modules (e.g. the Supabase client) read values through this shim so
// they work under either build without branching. ONLY public values belong
// here — never the Supabase service_role key or any secret.
//
// Phase 2: additive only. `src/data/supabase.ts` is switched to use this in the
// route-migration phase (when portal code first runs under Next).

type PublicEnvKey = 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'

function fromVite(key: PublicEnvKey): string | undefined {
  try {
    // Vite provides `import.meta.env` as an object of VITE_* vars at runtime.
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    return env?.[`VITE_${key}`]
  } catch {
    return undefined
  }
}

function fromProcess(key: PublicEnvKey): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[`NEXT_PUBLIC_${key}`] ?? process.env[`VITE_${key}`]
  }
  return undefined
}

/** Read a public env value from whichever build toolchain is active. */
export function publicEnv(key: PublicEnvKey): string | undefined {
  return fromVite(key) ?? fromProcess(key)
}
