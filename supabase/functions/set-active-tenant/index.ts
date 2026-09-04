// ============================================================================
// Edge Function: set-active-tenant  (multi-tenant H-2)
// ============================================================================
// Sets the caller's `app_metadata.active_tenant` so that current_tenant_id()
// stamps new rows into the correct tenant when a user belongs to MORE THAN ONE
// tenant. Single-membership users never need this (they auto-resolve).
//
// Why an Edge Function: writing app_metadata requires the SERVICE ROLE (admin
// API), which must NEVER touch the browser. This runs server-side only.
//
// Deploy (needs your Supabase project + service role secret):
//   supabase functions deploy set-active-tenant
//   supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
// The client calls it with the user's normal auth JWT:
//   await supabase.functions.invoke('set-active-tenant', { body: { tenant_id } })
// After it returns, the client must refresh the session so the new claim is in
// the JWT:  await supabase.auth.refreshSession()
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Missing Authorization bearer token' }, 401)

    const { tenant_id } = await req.json().catch(() => ({}))
    if (!tenant_id || typeof tenant_id !== 'string') {
      return json({ error: 'tenant_id (string) is required' }, 400)
    }

    // Admin client (service role) — server-side only.
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    // 1. Identify the caller from their JWT.
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401)
    const user = userData.user
    const email = (user.email ?? '').toLowerCase()

    // 2. Verify the caller has ACTIVE membership in the requested tenant.
    const { data: membership, error: mErr } = await admin
      .from('user_tenant_access')
      .select('tenant_id')
      .eq('tenant_id', tenant_id)
      .ilike('email', email)
      .eq('status', 'active')
      .maybeSingle()
    if (mErr) return json({ error: mErr.message }, 500)
    if (!membership) return json({ error: 'No active membership for that tenant' }, 403)

    // 3. Persist the active tenant into app_metadata (goes into future JWTs).
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), active_tenant: tenant_id },
    })
    if (updErr) return json({ error: updErr.message }, 500)

    return json({ ok: true, active_tenant: tenant_id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
