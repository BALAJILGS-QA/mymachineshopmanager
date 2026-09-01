import { redirect } from 'next/navigation'

// Preserve the Vite behaviour (src/routes/app/route.tsx notFoundComponent):
// unknown /app/* paths land on the dashboard.
export default function Page() {
  redirect('/app')
}
