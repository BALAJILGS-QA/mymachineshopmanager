import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/primitives'
import { useToolInventory } from '../hooks/useToolroom'
import { ToolActionsMenu } from '../components/ToolActionsMenu'
import { ToolTxnTable } from '../components/ToolTxnTable'

export function ToolTransfersPage() {
  const inventory = useToolInventory().data ?? []
  return (
    <div>
      <PageHeader
        title="Tool Transfers"
        subtitle="Move tools between tool room, stores, machine shop and other locations"
        actions={
          <ToolActionsMenu inventory={inventory} only={['transfer']} triggerLabel="New Transfer" />
        }
      />
      <Card>
        <ToolTxnTable types={['transfer']} emptyTitle="No transfers yet" />
      </Card>
    </div>
  )
}
