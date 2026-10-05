export interface TestUser {
  email: string
  password: string
  fullName: string
  companyName: string
  phone: string
  gstin: string
}

// A unique applicant per run so repeated executions never collide on an existing
// Supabase account. The `msmqa.test` domain is intentionally non-deliverable — the
// email is confirmed via the backend helper, never by a real mailbox.
export function makeTestUser(): TestUser {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
  return {
    email: `msm-e2e-${stamp}@msmqa.test`,
    password: 'E2e!Trial2026',
    fullName: `E2E Trial ${stamp}`,
    companyName: `E2E Shop ${stamp}`,
    phone: '9000000000',
    gstin: '',
  }
}
