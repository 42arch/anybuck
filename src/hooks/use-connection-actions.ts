import { useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { toast } from '@/components/ui/toast-manager'
import i18n from '@/i18n'

interface UseConnectionActionsOptions {
  connectSavedConnection: (connectionId: string) => Promise<void>
  disconnectConnection: (connectionId: string) => Promise<void>
  onConnected: () => void
}

export function useConnectionActions({ connectSavedConnection, disconnectConnection, onConnected }: UseConnectionActionsOptions) {
  const [connectingConnectionIds, setConnectingConnectionIds] = useState<Set<string>>(() => new Set())

  async function connectStorageConnection(connectionId: string) {
    if (connectingConnectionIds.has(connectionId))
      return
    setConnectingConnectionIds(current => new Set(current).add(connectionId))
    try {
      await connectSavedConnection(connectionId)
      onConnected()
    }
    catch (cause) {
      toast.add({ title: i18n.t('workflow.connectFailed', { message: errorMessage(cause) }), type: 'error', timeout: 4500 })
    }
    finally {
      setConnectingConnectionIds((current) => {
        const next = new Set(current)
        next.delete(connectionId)
        return next
      })
    }
  }

  async function disconnectStorageConnection(connectionId: string) {
    try {
      await disconnectConnection(connectionId)
    }
    catch (cause) {
      toast.add({ title: i18n.t('workflow.disconnectFailed', { message: errorMessage(cause) }), type: 'error', timeout: 4500 })
    }
  }

  return { connectingConnectionIds, connectStorageConnection, disconnectStorageConnection }
}
