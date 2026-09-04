import { ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge, Card } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'
import { usePermissions, type PermKey } from '@/features/hrm/permissions'
import { useToolCategories } from '../hooks/useToolroom'

const PERMS: Array<{ key: PermKey; label: string }> = [
  { key: 'TOOLROOM_VIEW', label: 'View Tool Room' },
  { key: 'TOOLROOM_TOOL_MANAGE', label: 'Manage tools & categories' },
  { key: 'TOOLROOM_RECEIVE', label: 'Receive tools' },
  { key: 'TOOLROOM_ISSUE', label: 'Issue / consume tools' },
  { key: 'TOOLROOM_RETURN', label: 'Return tools' },
  { key: 'TOOLROOM_RESERVE', label: 'Reserve tools' },
  { key: 'TOOLROOM_TRANSFER', label: 'Transfer tools' },
  { key: 'TOOLROOM_MAINTAIN', label: 'Maintenance' },
  { key: 'TOOLROOM_CALIBRATE', label: 'Calibration' },
  { key: 'TOOLROOM_SCRAP', label: 'Scrap / dispose' },
  { key: 'TOOLROOM_ADJUST', label: 'Stock adjustments' },
  { key: 'TOOLROOM_REPORT', label: 'Reports & export' },
  { key: 'TOOLROOM_SETTINGS', label: 'Manage settings' },
]

const THRESHOLDS = [
  ['Tool life — warning', '80% consumed'],
  ['Tool life — critical', '90% consumed'],
  ['Tool life — expired', '100% consumed'],
  ['Calibration due (early)', '30 days before due'],
  ['Calibration due (urgent)', '7 days before due'],
  ['Maintenance due', '14 days before due'],
]

export function ToolSettingsPage() {
  const perms = usePermissions()
  const categories = useToolCategories().list.data ?? []

  return (
    <div>
      <PageHeader
        title="Tool Room Settings"
        subtitle="Access control, alert thresholds and configuration"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck size={16} className="text-brand-600" /> Your Tool Room access
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Roles &amp; permissions are managed centrally under HR Settings. Every action is
            enforced server-side; this reflects what your account can do.
          </p>
          <div className="space-y-1.5">
            {PERMS.map((p) => (
              <div key={p.key} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{p.label}</span>
                <Badge tone={perms.can(p.key) ? 'green' : 'slate'}>
                  {perms.can(p.key) ? 'Allowed' : 'No access'}
                </Badge>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Manage roles in{' '}
            <AppLink to="/app/hrm/settings" className="text-brand-700 hover:underline">
              HR Settings → Roles &amp; Access
            </AppLink>
            .
          </p>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Alert thresholds</h3>
            <div className="space-y-2">
              {THRESHOLDS.map(([label, val]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-medium text-slate-900">{val}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Configuration</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Tool categories</span>
              <AppLink
                to="/app/tool-room/categories"
                className="font-medium text-brand-700 hover:underline"
              >
                {categories.length} defined
              </AppLink>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Numbering follows the app document-number patterns (TR-&#123;FY&#125;-#####).
              Availability is always derived from the transaction ledger and cannot be edited
              directly.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
