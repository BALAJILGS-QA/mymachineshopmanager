import { redirect } from 'next/navigation'

// Module hub redirect (was src/routes/app/configuration.tsx): landing on the module
// title goes to its first tab, exactly as before.
export default function Page() {
  redirect('/app/companies')
}
