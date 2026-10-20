import type { ConnectR2Request, R2ConnectionResult, SavedR2Connection } from '@/api/storage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import {
  connectR2,
  connectSavedR2Connection,
  disconnectR2Connection,
  forgetSavedR2Connection,
  listSavedR2Connections,
} from '@/api/storage'

export type ActiveR2Connection = Pick<R2ConnectionResult, 'connectionId' | 'bucket' | 'endpoint' | 'name'>

export interface R2ConnectionEntry extends ActiveR2Connection {
  connected: boolean
}

interface R2ConnectionState {
  sessionConnections: ActiveR2Connection[]
  activeConnectionId: string | null
  selectConnection: (connectionId: string) => void
  rememberSessionConnection: (connection: ActiveR2Connection) => void
  removeSessionConnection: (connectionId: string) => void
}

const connectionQueryKey = ['storage', 'r2', 'connections'] as const

const useR2ConnectionStore = create<R2ConnectionState>(set => ({
  sessionConnections: [],
  activeConnectionId: null,
  selectConnection: activeConnectionId => set({ activeConnectionId }),
  rememberSessionConnection: connection => set((state) => {
    const sessionConnections = [
      ...state.sessionConnections.filter(item => item.connectionId !== connection.connectionId),
      connection,
    ]
    return { sessionConnections, activeConnectionId: connection.connectionId }
  }),
  removeSessionConnection: connectionId => set(state => ({
    sessionConnections: state.sessionConnections.filter(item => item.connectionId !== connectionId),
    activeConnectionId: state.activeConnectionId === connectionId ? null : state.activeConnectionId,
  })),
}))

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
    name: result.name,
    bucket: result.bucket,
    endpoint: result.endpoint,
  }
}
