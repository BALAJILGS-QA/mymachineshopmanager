import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/primitives'
import { useToolInventory } from '../hooks/useToolroom'
import { ToolActionsMenu } from '../components/ToolActionsMenu'
import { ToolTxnTable } from '../components/ToolTxnTable'

export function ToolIssuePage() {
  const inventory = useToolInventory().data ?? []
  return (
    <div>
      <PageHeader
        title="Tool Issue"
        subtitle="Issue tools to machines, work orders, operations or employees — availability decreases atomically"
        actions={
          <ToolActionsMenu
            inventory={inventory}
            only={['issue', 'consume']}
            triggerLabel="Issue / Consume"
          />
        }
      />
      <Card>
        <ToolTxnTable
          types={['issue', 'issue_reserved', 'consume']}
          emptyTitle="No tools issued yet"
        />
      </Card>
    </div>
  )
}
