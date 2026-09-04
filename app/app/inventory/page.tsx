import { redirect } from 'next/navigation'

// Inventory module hub → dashboard (keeps the module root a stable entry point).
export default function Page() {
  redirect('/app/inventory/dashboard')
}
