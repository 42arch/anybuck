import type { ConnectStorageRequest, SavedStorageConnection, StorageConnectionResult, UpdateStorageConnectionRequest } from '@/types/connection'
import { invokeCommand } from '@/api/invoke'

export function connectStorage(request: ConnectStorageRequest) {
  return invokeCommand<StorageConnectionResult>('connect_storage', { request })
}

export function listSavedConnections() {
  return invokeCommand<SavedStorageConnection[]>('list_saved_connections')
}

export function renameSavedConnection(connectionId: string, name: string) {
  return invokeCommand<SavedStorageConnection>('rename_connection', { connectionId, name })
}

export function connectSavedConnection(connectionId: string) {
  return invokeCommand<StorageConnectionResult>('connect_saved_connection', { connectionId })
}

export function updateSavedConnection(request: UpdateStorageConnectionRequest) {
  return invokeCommand<StorageConnectionResult>('update_saved_connection', { request })
}

export function disconnectConnection(connectionId: string) {
  return invokeCommand<void>('disconnect_connection', { connectionId })
}

export function forgetSavedConnection(connectionId: string) {
  return invokeCommand<void>('forget_saved_connection', { connectionId })
}
