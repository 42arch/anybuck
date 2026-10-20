import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

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

export interface MoveR2ObjectsResult {
  movedCount: number
  failed: { key: string, reason: string }[]
}

export interface CopyR2ObjectsResult {
  copiedCount: number
  failed: { key: string, reason: string }[]
}

export interface DownloadR2ObjectsResult {
  downloadedCount: number
  failedKeys: string[]
}

export interface TransferTask {
  id: string
  parentId: string | null
  operation: 'upload' | 'download' | 'folder'
  connectionId: string
  bucket: string
  displayName: string
  objectKey: string
  localPath: string
  relativePath: string
  destinationRoot: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'skipped'
  error: string | null
  createdAt: number
  updatedAt: number
}

export interface DownloadPlanSummary {
  planId: string
  conflicts: string[]
  fileCount: number
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

export function moveR2Objects(connectionId: string, keys: string[], destinationPrefix: string) {
  return invoke<MoveR2ObjectsResult>('move_r2_objects', { connectionId, keys, destinationPrefix })
}

export function copyR2Objects(connectionId: string, keys: string[], destinationPrefix: string) {
  return invoke<CopyR2ObjectsResult>('copy_r2_objects', { connectionId, keys, destinationPrefix })
}

export function createR2Folder(connectionId: string, prefix: string, name: string) {
  return invoke<void>('create_r2_folder', { connectionId, prefix, name })
}

export function uploadR2File(connectionId: string, prefix: string, localPath: string) {
  return invoke<void>('upload_r2_file', { connectionId, prefix, localPath })
}

export function downloadR2Objects(connectionId: string, prefix: string, keys: string[], destinationPath: string) {
  return invoke<DownloadR2ObjectsResult>('download_r2_objects', {
    connectionId,
    prefix,
    keys,
    destinationPath,
  })
}

export function listTransferTasks() {
  return invoke<TransferTask[]>('list_transfer_tasks')
}

export function onTransferTaskUpdated(callback: (task: TransferTask) => void) {
  return listen<TransferTask>('transfer-task-updated', event => callback(event.payload))
}

export function onTransferHistoryCleared(callback: () => void) {
  return listen('transfer-history-cleared', callback)
}

export function enqueueR2Uploads(connectionId: string, prefix: string, localPaths: string[]) {
  return invoke<TransferTask[]>('enqueue_r2_uploads', { connectionId, prefix, localPaths })
}

export function prepareR2Download(connectionId: string, prefix: string, keys: string[], destinationPath: string) {
  return invoke<DownloadPlanSummary>('prepare_r2_download', { connectionId, prefix, keys, destinationPath })
}

export function enqueueR2Download(planId: string, conflictAction: 'overwrite' | 'skip') {
  return invoke<TransferTask[]>('enqueue_r2_download', { planId, conflictAction })
}

export function cancelTransferTask(taskId: string) {
  return invoke<void>('cancel_transfer_task', { taskId })
}

export function retryTransferTask(taskId: string) {
  return invoke<TransferTask>('retry_transfer_task', { taskId })
}

export function clearTransferHistory() {
  return invoke<void>('clear_transfer_history')
}
