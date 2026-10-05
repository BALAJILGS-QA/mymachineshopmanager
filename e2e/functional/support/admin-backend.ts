import { ENV } from './env'

// Backend admin utility for TEST PREREQUISITES only — not part of the user-facing
// behaviour under test. It talks to the Supabase Management API (SQL endpoint) to:
//   • confirmEmail()  — simulate the user clicking the email-confirmation link
//                       (the project has mailer_autoconfirm = false and there is
//                       no mailbox in CI), so the approved user can actually sign in;
//   • deleteUser()    — tear down the test user + its provisioned tenant so the
//                       shared prod backend stays clean between runs;
//   • registryStatus()— read the user's approval status straight from the DB for
//                       diagnostics / robust waits.
// Everything the PRODUCT does (signup, approval, login, dashboard) is driven only
// through the real UI by the page objects.

async function runSql(sql: string): Promise<unknown> {
  const url = `https://api.supabase.com/v1/projects/${ENV.supabase.ref}/database/query`
  let lastErr: unknown
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ENV.managementToken}`,
          'Content-Type': 'application/json',
          // A custom UA avoids the Cloudflare 1010 block on the default agent.
          'User-Agent': 'msm-functional-tests/1.0',
        },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(45_000),
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`Management API ${res.status}: ${text}`)
      return JSON.parse(text)
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 2_000))
    }
  }
  throw lastErr
}

// SQL string literal escape (single quotes). Emails are validated upstream, but be
// safe anyway.
function lit(s: string): string {
  return s.replace(/'/g, "''")
}

/** Mark the user's email as confirmed so signInWithPassword succeeds. */
export async function confirmEmail(email: string): Promise<void> {
  await runSql(
    `update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
       where lower(email) = lower('${lit(email)}');`,
  )
}

/** Read the registry status ('pending' | 'approved' | 'rejected' | null). */
export async function registryStatus(email: string): Promise<string | null> {
  const rows = (await runSql(
    `select u->>'status' as status
       from public.app_state s
       cross join lateral jsonb_array_elements(coalesce(s.data->'users','[]'::jsonb)) u
      where s.id = 'singleton' and lower(u->>'email') = lower('${lit(email)}')
      limit 1;`,
  )) as Array<{ status: string | null }>
  return rows?.[0]?.status ?? null
}

/** Best-effort teardown: remove the test user and any tenant it provisioned.
 *  FK-safe order — hr_settings / tenant_settings do NOT cascade from tenants, so
 *  they must be deleted first or the whole batch aborts. */
export async function deleteUser(email: string): Promise<void> {
  const e = lit(email)
  const ownedTenants = `(select tenant_id from public.user_tenant_access where lower(email) = lower('${e}'))`
  try {
    await runSql(`
      delete from public.hr_settings     where tenant_id in ${ownedTenants};
      delete from public.tenant_settings where tenant_id in ${ownedTenants};
      delete from public.tenants         where id in ${ownedTenants};
      delete from public.user_tenant_access where lower(email) = lower('${e}');
      delete from public.approved_users  where lower(email) = lower('${e}');
      update public.app_state
         set data = jsonb_set(coalesce(data,'{}'::jsonb), '{users}',
           (select coalesce(jsonb_agg(u),'[]'::jsonb)
              from jsonb_array_elements(coalesce(data->'users','[]'::jsonb)) u
             where lower(u->>'email') <> lower('${e}')))
       where id = 'singleton';
      delete from auth.users where lower(email) = lower('${e}');
    `)
  } catch {
    // Teardown is best-effort; a leftover test user must never fail the run.
  }
}
