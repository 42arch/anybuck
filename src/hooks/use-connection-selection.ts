import type { ActiveR2Connection, R2ConnectionEntry } from '@/types/connection'
import { useState } from 'react'

interface UseConnectionSelectionOptions {
  connection: ActiveR2Connection | null
  connections: R2ConnectionEntry[]
  selectConnection: (connectionId: string) => void
  onSelect: () => void
}

export function useConnectionSelection({ connection, connections, selectConnection, onSelect }: UseConnectionSelectionOptions) {
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [bucketSelection, setBucketSelection] = useState(0)
  const selectedConnection = connection ?? connections.find(item => item.connectionId === selectedConnectionId) ?? null

  function selectStorageConnection(connectionId: string) {
    setSelectedConnectionId(connectionId)
    if (connectionId === connection?.connectionId)
      setBucketSelection(current => current + 1)
    selectConnection(connectionId)
    onSelect()
  }

  return { selectedConnection, bucketSelection, selectStorageConnection }
}
