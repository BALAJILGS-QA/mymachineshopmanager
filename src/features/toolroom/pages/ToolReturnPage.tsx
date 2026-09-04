import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/primitives'
import { useToolInventory } from '../hooks/useToolroom'
import { ToolActionsMenu } from '../components/ToolActionsMenu'
import { ToolTxnTable } from '../components/ToolTxnTable'

export function ToolReturnPage() {
  const inventory = useToolInventory().data ?? []
  return (
    <div>
      <PageHeader
        title="Tool Return"
        subtitle="Record returns and route by condition — good → available, damaged/needs-service → the right queue"
        actions={
          <ToolActionsMenu inventory={inventory} only={['return']} triggerLabel="Return Tool" />
        }
      />
      <Card>
        <ToolTxnTable
          types={['return_available', 'return_damaged', 'return_maintenance', 'return_calibration']}
          emptyTitle="No returns yet"
        />
      </Card>
    </div>
  )
}
