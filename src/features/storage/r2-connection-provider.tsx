import type { ActiveR2Connection, R2ConnectionEntry } from './r2-connection-context'
import type { ConnectR2Request, SavedR2Connection } from '@/api/storage'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  connectR2,
  connectSavedR2Connection,
  disconnectR2Connection,
  forgetSavedR2Connection,
  listSavedR2Connections,
} from '@/api/storage'
import { R2ConnectionContext } from './r2-connection-context'

const connectionQueryKey = ['storage', 'r2', 'connections'] as const

export function R2ConnectionProvider({ children }: { children: React.ReactNode }) {
  const savedQuery = useQuery({ queryKey: connectionQueryKey, queryFn: listSavedR2Connections })
  const connectMutation = useMutation({ mutationFn: connectR2, gcTime: 0, retry: false })
  const connectSavedMutation = useMutation({ mutationFn: connectSavedR2Connection, gcTime: 0, retry: false })
  const disconnectMutation = useMutation({ mutationFn: disconnectR2Connection, gcTime: 0, retry: false })
  const forgetMutation = useMutation({ mutationFn: forgetSavedR2Connection, gcTime: 0, retry: false })
  const [sessionConnections, setSessionConnections] = useState<ActiveR2Connection[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [savedConnectionsOverride, setSavedConnectionsOverride] = useState<SavedR2Connection[] | null>(null)
  const [removedConnectionIds, setRemovedConnectionIds] = useState<string[]>([])

  const savedConnections = (savedConnectionsOverride ?? savedQuery.data ?? []).filter(profile => !removedConnectionIds.includes(profile.id))
  const sessionIds = new Set(sessionConnections.map(connection => connection.connectionId))
  const connections: R2ConnectionEntry[] = [
    ...savedConnections.map(profile => ({
      connectionId: profile.id,
      name: profile.name,
      bucket: profile.bucket,
      endpoint: profile.endpoint,
      connected: sessionIds.has(profile.id),
    })),
    ...sessionConnections
      .filter(connection => !savedConnections.some(profile => profile.id === connection.connectionId))
      .map(connection => ({ ...connection, connected: true })),
  ]
  const connection = sessionConnections.find(item => item.connectionId === activeConnectionId) ?? null
  const connectionListError = savedQuery.error instanceof Error ? savedQuery.error.message : ''

  function rememberSessionConnection(result: { connectionId: string, name: string, bucket: string, endpoint: string }) {
    const active = { connectionId: result.connectionId, name: result.name, bucket: result.bucket, endpoint: result.endpoint }
    setSessionConnections(current => [...current.filter(item => item.connectionId !== active.connectionId), active])
    setActiveConnectionId(active.connectionId)
  }

  async function connect(request: ConnectR2Request) {
    let result
    try {
      result = await connectMutation.mutateAsync(request)
    }
    finally {
      connectMutation.reset()
    }
    rememberSessionConnection(result)
    if (request.rememberConnection) {
      setRemovedConnectionIds(current => current.filter(id => id !== result.connectionId))
      setSavedConnectionsOverride((current) => {
        const latest = current ?? savedQuery.data ?? []
        const saved: SavedR2Connection = {
          id: result.connectionId,
          name: result.name,
          accountId: request.accountId,
          endpoint: result.endpoint,
          bucket: result.bucket,
        }
        return [...latest.filter(item => item.id !== saved.id), saved]
      })
    }
  }

  async function connectSavedConnection(connectionId: string) {
    let result
    try {
      result = await connectSavedMutation.mutateAsync(connectionId)
    }
    finally {
      connectSavedMutation.reset()
    }
    rememberSessionConnection(result)
  }

  async function disconnectConnection(connectionId: string) {
    try {
      await disconnectMutation.mutateAsync(connectionId)
    }
    finally {
      disconnectMutation.reset()
    }
    setSessionConnections(current => current.filter(item => item.connectionId !== connectionId))
    if (activeConnectionId === connectionId)
      setActiveConnectionId(null)
  }

  async function forgetSavedConnection(connectionId: string) {
    try {
      await forgetMutation.mutateAsync(connectionId)
    }
    finally {
      forgetMutation.reset()
    }
    setSessionConnections(current => current.filter(item => item.connectionId !== connectionId))
    setRemovedConnectionIds(current => [...current, connectionId])
    setSavedConnectionsOverride(current => (current ?? savedQuery.data ?? []).filter(item => item.id !== connectionId))
    if (activeConnectionId === connectionId)
      setActiveConnectionId(null)
  }

  return (
    <R2ConnectionContext value={{
      connection,
      connections,
      savedConnections,
      connectionListError,
      isRestoring: savedQuery.isPending,
      selectConnection: setActiveConnectionId,
      connect,
      connectSavedConnection,
      disconnectConnection,
      forgetSavedConnection,
    }}
    >
      {children}
    </R2ConnectionContext>
  )
}
