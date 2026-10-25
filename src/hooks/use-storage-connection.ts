import type {
  ActiveStorageConnection,
  ConnectStorageRequest,
  SavedStorageConnection,
  StorageConnectionEntry,
  StorageConnectionResult,
  UpdateStorageConnectionRequest,
} from '@/types/connection'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  connectSavedConnection,
  connectStorage,
  disconnectConnection,
  forgetSavedConnection,
  listSavedConnections,
  renameSavedConnection,
  updateSavedConnection,
} from '@/api/connections'
import { useConnectionStore } from '@/store/connection-store'
import { useSettingsStore } from '@/store/settings-store'

const connectionQueryKey = ['storage', 'connections'] as const

export function useStorageConnection() {
  const queryClient = useQueryClient()
  const savedQuery = useQuery({ queryKey: connectionQueryKey, queryFn: listSavedConnections })
  const sessionConnections = useConnectionStore(state => state.sessionConnections)
  const activeConnectionId = useConnectionStore(state => state.activeConnectionId)
  const selectConnection = useConnectionStore(state => state.selectConnection)
  const rememberSessionConnection = useConnectionStore(state => state.rememberSessionConnection)
  const renameSessionConnection = useConnectionStore(state => state.renameSessionConnection)
  const removeSessionConnection = useConnectionStore(state => state.removeSessionConnection)
  const setPublicBaseUrl = useSettingsStore(state => state.setPublicBaseUrl)

  const savedConnections = savedQuery.data ?? []
  const savedConnectionIds = new Set(savedConnections.map(profile => profile.id))
  const sessionIds = new Set(sessionConnections.map(item => item.connectionId))
  const connections: StorageConnectionEntry[] = [
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
  const selectionVersion = useConnectionStore(state => state.selectionVersion)
  const connection = sessionConnections.find(item => item.connectionId === activeConnectionId) ?? null
  const selectedConnection = connections.find(item => item.connectionId === activeConnectionId) ?? null

  async function connect(request: ConnectStorageRequest) {
    const result = await connectStorage(request)
    rememberSessionConnection(toActiveConnection(result))
    if (request.rememberConnection) {
      queryClient.setQueryData<SavedStorageConnection[]>(connectionQueryKey, current => [
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

  async function connectSaved(connectionId: string) {
    const result = await connectSavedConnection(connectionId)
    rememberSessionConnection(toActiveConnection(result))
  }

  async function updateConnection(request: UpdateStorageConnectionRequest) {
    const previous = savedConnections.find(item => item.id === request.connectionId)
    const result = await updateSavedConnection(request)
    const targetChanged = Boolean(previous && (previous.bucket !== result.bucket || previous.endpoint !== result.endpoint))
    rememberSessionConnection(toActiveConnection(result))
    selectConnection(result.connectionId)
    if (targetChanged)
      setPublicBaseUrl(result.connectionId, '')
    queryClient.setQueryData<SavedStorageConnection[]>(connectionQueryKey, current =>
      (current ?? savedConnections).map(item => item.id === result.connectionId
        ? {
            ...item,
            name: result.name,
            accountId: request.accountId,
            region: request.region,
            endpoint: result.endpoint,
            bucket: result.bucket,
          }
        : item))
    queryClient.removeQueries({ queryKey: ['storage', 'objects', result.connectionId] })
    void queryClient.invalidateQueries({ queryKey: connectionQueryKey })
    return targetChanged
  }

  async function disconnect(connectionId: string) {
    await disconnectConnection(connectionId)
    removeSessionConnection(connectionId)
  }

  async function forgetConnection(connectionId: string) {
    await forgetSavedConnection(connectionId)
    removeSessionConnection(connectionId)
    queryClient.setQueryData<SavedStorageConnection[]>(connectionQueryKey, current => (current ?? savedConnections).filter(item => item.id !== connectionId))
    void queryClient.invalidateQueries({ queryKey: connectionQueryKey })
  }

  async function renameConnection(connectionId: string, name: string) {
    const trimmedName = name.trim()
    if (!trimmedName || [...trimmedName].length > 100)
      throw new Error('连接名称应为 1–100 个字符。')

    if (savedConnectionIds.has(connectionId)) {
      const updated = await renameSavedConnection(connectionId, trimmedName)
      queryClient.setQueryData<SavedStorageConnection[]>(connectionQueryKey, current =>
        (current ?? savedConnections).map(item => item.id === connectionId ? updated : item))
      void queryClient.invalidateQueries({ queryKey: connectionQueryKey })
    }
    else if (!sessionConnections.some(item => item.connectionId === connectionId)) {
      throw new Error('连接不存在，请刷新连接列表后重试。')
    }
    renameSessionConnection(connectionId, trimmedName)
  }

  return {
    connection,
    selectedConnection,
    selectionVersion,
    connections,
    savedConnections,
    connectionListError: savedQuery.error instanceof Error ? savedQuery.error.message : '',
    isRestoring: savedQuery.isPending,
    selectConnection,
    connect,
    connectSavedConnection: connectSaved,
    updateConnection,
    disconnectConnection: disconnect,
    forgetSavedConnection: forgetConnection,
    renameConnection,
  }
}

function toActiveConnection(result: StorageConnectionResult): ActiveStorageConnection {
  return {
    connectionId: result.connectionId,
    provider: result.provider,
    name: result.name,
    bucket: result.bucket,
    endpoint: result.endpoint,
  }
}
