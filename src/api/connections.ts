import type { ConnectStorageRequest, SavedStorageConnection, StorageConnectionResult, UpdateStorageConnectionRequest } from '@/types/connection'
import { invoke } from '@tauri-apps/api/core'

export function connectStorage(request: ConnectStorageRequest) {
  return invoke<StorageConnectionResult>('connect_storage', { request })
}

export function listSavedConnections() {
  return invoke<SavedStorageConnection[]>('list_saved_connections')
}

export function renameSavedConnection(connectionId: string, name: string) {
  return invoke<SavedStorageConnection>('rename_connection', { connectionId, name })
}

export function connectSavedConnection(connectionId: string) {
  return invoke<StorageConnectionResult>('connect_saved_connection', { connectionId })
}

export function updateSavedConnection(request: UpdateStorageConnectionRequest) {
  return invoke<StorageConnectionResult>('update_saved_connection', { request })
}

export function disconnectConnection(connectionId: string) {
  return invoke<void>('disconnect_connection', { connectionId })
}

export function forgetSavedConnection(connectionId: string) {
  return invoke<void>('forget_saved_connection', { connectionId })
}
