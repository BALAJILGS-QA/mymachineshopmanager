import { redirect } from 'next/navigation'

// Backward-compatibility: Materials & Stock moved into the Inventory module.
// Existing bookmarks/deep links to /app/materials redirect to the new location.
export default function Page() {
  redirect('/app/inventory/materials')
}
