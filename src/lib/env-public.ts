// Cross-runtime PUBLIC env accessor for the migration period.
//
// During the Vite → Next.js migration the codebase is built by BOTH toolchains:
//   • Vite  — exposes `import.meta.env.VITE_*` (statically replaced at build).
//   • Next  — exposes `process.env.NEXT_PUBLIC_*` (statically inlined into the
//             client bundle at build).
//
// Both bundlers ONLY substitute STATIC references (`import.meta.env.VITE_FOO`,
// `process.env.NEXT_PUBLIC_FOO`) — dynamic keys like `env[`VITE_${k}`]` are NOT
// inlined into client bundles. So each var is read via an explicit static access
// per key. ONLY public values belong here — never a service_role key or secret.

type PublicEnvKey = 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'

function fromVite(key: PublicEnvKey): string | undefined {
  // Under Vite these are statically inlined. Under Next, `import.meta.env` is
  // undefined, so member access is guarded.
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    if (!env) return undefined
    return key === 'SUPABASE_URL' ? env.VITE_SUPABASE_URL : env.VITE_SUPABASE_ANON_KEY
  } catch {
    return undefined
  }
}

function fromProcess(key: PublicEnvKey): string | undefined {
  // Next statically inlines these NEXT_PUBLIC_* reads into the client bundle at
  // build (and reads real process.env on the server). This path is only reached
  // when fromVite() returned undefined (i.e. not the Vite runtime); try/catch
  // guards against `process` being absent.
  try {
    if (key === 'SUPABASE_URL') {
      return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
    }
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  } catch {
    return undefined
  }
}

/** Read a public env value from whichever build toolchain is active. */
export function publicEnv(key: PublicEnvKey): string | undefined {
  return fromVite(key) ?? fromProcess(key)
}
