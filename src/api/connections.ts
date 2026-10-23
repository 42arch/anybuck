import type { ConnectStorageRequest, SavedStorageConnection, StorageConnectionResult } from '@/types/connection'
import { invoke } from '@tauri-apps/api/core'

export function connectStorage(request: ConnectStorageRequest) {
  return invoke<StorageConnectionResult>('connect_storage', { request })
}

export function listSavedConnections() {
  return invoke<SavedStorageConnection[]>('list_saved_connections')
}

export function connectSavedConnection(connectionId: string) {
  return invoke<StorageConnectionResult>('connect_saved_connection', { connectionId })
}

export function disconnectConnection(connectionId: string) {
  return invoke<void>('disconnect_connection', { connectionId })
}

export function forgetSavedConnection(connectionId: string) {
  return invoke<void>('forget_saved_connection', { connectionId })
}
