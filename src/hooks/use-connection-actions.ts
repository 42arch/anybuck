import { useState } from 'react'
import { toast } from '@/components/ui/toast-manager'

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
      toast.add({ title: `连接失败：${cause instanceof Error ? cause.message : String(cause)}`, type: 'error', timeout: 4500 })
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
      toast.add({ title: `断开连接失败：${cause instanceof Error ? cause.message : String(cause)}`, type: 'error', timeout: 4500 })
    }
  }

  return { connectingConnectionIds, connectStorageConnection, disconnectStorageConnection }
}
