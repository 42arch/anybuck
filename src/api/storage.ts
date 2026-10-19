import { invoke } from '@tauri-apps/api/core'

export interface ConnectR2Request {
  connectionId?: string
  name: string
  accountId: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  rememberConnection: boolean
}

export interface SavedR2Connection {
  id: string
  name: string
  accountId: string
  endpoint: string
  bucket: string
}

export interface R2Object {
  key: string
  name: string
  kind: 'directory' | 'file'
  size: number | null
  lastModified: string | null
  etag: string | null
}

export interface R2ObjectPage {
  objects: R2Object[]
  nextToken: string | null
}

export interface DeleteR2ObjectsResult {
  deletedCount: number
  failedKeys: string[]
}

export interface R2ConnectionResult extends R2ObjectPage {
  connectionId: string
  name: string
  bucket: string
  endpoint: string
}

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

export function listR2Objects(connectionId: string, prefix: string, continuationToken?: string | null) {
  return invoke<R2ObjectPage>('list_r2_objects', {
    connectionId,
    prefix,
    continuationToken: continuationToken ?? null,
  })
}

export function deleteR2Objects(connectionId: string, keys: string[]) {
  return invoke<DeleteR2ObjectsResult>('delete_r2_objects', { connectionId, keys })
}
