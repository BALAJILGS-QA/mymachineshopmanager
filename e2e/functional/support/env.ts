// Central environment / target resolver for the functional suite. Public values
// (app URL, Supabase anon key/ref) carry safe defaults; genuine secrets
// (super-admin password, Supabase management token) come from the environment and
// are validated LAZILY (on first access) so test collection / `--list` works
// without them — only an actual run needs them.

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Export it (or load .env.deploy.local) before running the functional suite — see e2e/functional/README.md`,
    )
  }
  return v
}

export const ENV = {
  /** App under test (default: deployed prod). */
  baseURL: process.env.FUNC_BASE_URL || 'https://mymachineshopmanager.vercel.app',

  /** The sole super admin who approves registrations (migration 0062). */
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@sreebalajiindustries.com',
    // Validated on access, not at import.
    get password(): string {
      return required('SUPER_ADMIN_PASSWORD', process.env.APP_PASS)
    },
  },

  /** Supabase project — public anon values are safe to default. */
  supabase: {
    url:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      'https://ydhvsiixwmbxoumglpvq.supabase.co',
    ref: process.env.SUPABASE_PROJECT_REF || 'ydhvsiixwmbxoumglpvq',
  },

  /**
   * Supabase Management API token — used ONLY by admin-backend.ts for test
   * prerequisites a user/mailbox can't do deterministically: confirming the
   * signup email (mailer_autoconfirm is off in this project) and tearing the
   * test user down afterwards. Never commit it. Validated on access.
   */
  get managementToken(): string {
    return required('SUPABASE_ACCESS_TOKEN')
  },
} as const
