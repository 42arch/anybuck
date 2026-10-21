import type { ConnectR2Request, R2ConnectionResult, SavedR2Connection } from '@/types/connection'
import { invoke } from '@tauri-apps/api/core'

export function connectR2(request: ConnectR2Request) {
  return invoke<R2ConnectionResult>('connect_r2', { request })
}

export function listSavedR2Connections() {
  return invoke<SavedR2Connection[]>('list_saved_r2_connections')
}

export function connectSavedR2Connection(connectionId: string) {
  return invoke<R2ConnectionResult>('connect_saved_r2_connection', { connectionId })
}

export function disconnectR2Connection(connectionId: string) {
  return invoke<void>('disconnect_r2_connection', { connectionId })
}

export function forgetSavedR2Connection(connectionId: string) {
  return invoke<void>('forget_saved_r2_connection', { connectionId })
}
