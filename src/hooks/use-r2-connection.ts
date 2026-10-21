import type { ActiveR2Connection, ConnectR2Request, R2ConnectionEntry, R2ConnectionResult, SavedR2Connection } from '@/types/connection'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  connectR2,
  connectSavedR2Connection,
  disconnectR2Connection,
  forgetSavedR2Connection,
  listSavedR2Connections,
} from '@/api/connections'
import { useR2ConnectionStore } from '@/store/r2-connection-store'

const connectionQueryKey = ['storage', 'connections'] as const

export function useR2Connection() {
  const queryClient = useQueryClient()
  const savedQuery = useQuery({ queryKey: connectionQueryKey, queryFn: listSavedR2Connections })
  const sessionConnections = useR2ConnectionStore(state => state.sessionConnections)
  const activeConnectionId = useR2ConnectionStore(state => state.activeConnectionId)
  const selectConnection = useR2ConnectionStore(state => state.selectConnection)
  const rememberSessionConnection = useR2ConnectionStore(state => state.rememberSessionConnection)
  const removeSessionConnection = useR2ConnectionStore(state => state.removeSessionConnection)

  const savedConnections = savedQuery.data ?? []
  const savedConnectionIds = new Set(savedConnections.map(profile => profile.id))
  const sessionIds = new Set(sessionConnections.map(item => item.connectionId))
  const connections: R2ConnectionEntry[] = [
    ...savedConnections.map(profile => ({
      connectionId: profile.id,
      provider: profile.provider,
      name: profile.name,
      bucket: profile.bucket,
      endpoint: profile.endpoint,
      connected: sessionIds.has(profile.id),
    })),
    ...sessionConnections
      .filter(connection => !savedConnectionIds.has(connection.connectionId))
      .map(connection => ({ ...connection, connected: true })),
  ]
  const connection = sessionConnections.find(item => item.connectionId === activeConnectionId) ?? null

  async function connect(request: ConnectR2Request) {
    const result = await connectR2(request)
    rememberSessionConnection(toActiveConnection(result))
    if (request.rememberConnection) {
      queryClient.setQueryData<SavedR2Connection[]>(connectionQueryKey, current => [
        ...(current ?? savedConnections).filter(item => item.id !== result.connectionId),
        {
          id: result.connectionId,
          name: result.name,
          provider: result.provider,
          region: request.region,
          accountId: request.accountId,
          endpoint: result.endpoint,
          bucket: result.bucket,
        },
      ])
      void queryClient.invalidateQueries({ queryKey: connectionQueryKey })
    }
  }

  async function connectSavedConnection(connectionId: string) {
    const result = await connectSavedR2Connection(connectionId)
    rememberSessionConnection(toActiveConnection(result))
  }

  async function disconnectConnection(connectionId: string) {
    await disconnectR2Connection(connectionId)
    removeSessionConnection(connectionId)
  }

  async function forgetConnection(connectionId: string) {
    await forgetSavedR2Connection(connectionId)
    removeSessionConnection(connectionId)
    queryClient.setQueryData<SavedR2Connection[]>(connectionQueryKey, current => (current ?? savedConnections).filter(item => item.id !== connectionId))
    void queryClient.invalidateQueries({ queryKey: connectionQueryKey })
  }

  return {
    connection,
    connections,
    savedConnections,
    connectionListError: savedQuery.error instanceof Error ? savedQuery.error.message : '',
    isRestoring: savedQuery.isPending,
    selectConnection,
    connect,
    connectSavedConnection,
    disconnectConnection,
    forgetSavedConnection: forgetConnection,
  }
}

function toActiveConnection(result: R2ConnectionResult): ActiveR2Connection {
  return {
    connectionId: result.connectionId,
    provider: result.provider,
    name: result.name,
    bucket: result.bucket,
    endpoint: result.endpoint,
  }
}
