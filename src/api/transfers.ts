import type { DownloadObjectsResult, DownloadPlanSummary, TransferTask } from '@/types/transfer'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export function uploadFile(connectionId: string, prefix: string, localPath: string) {
  return invoke<void>('upload_file', { connectionId, prefix, localPath })
}

export function downloadObjects(connectionId: string, prefix: string, keys: string[], destinationPath: string) {
  return invoke<DownloadObjectsResult>('download_objects', {
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

export function enqueueUploads(connectionId: string, prefix: string, localPaths: string[]) {
  return invoke<TransferTask[]>('enqueue_uploads', { connectionId, prefix, localPaths })
}

export function enqueueObjectOperation(connectionId: string, keys: string[], destinationPrefix: string, operation: 'copy' | 'move') {
  return invoke<TransferTask[]>('enqueue_object_operation', { connectionId, keys, destinationPrefix, operation })
}

export function prepareDownload(connectionId: string, prefix: string, keys: string[], destinationPath: string) {
  return invoke<DownloadPlanSummary>('prepare_download', { connectionId, prefix, keys, destinationPath })
}

export function enqueueDownload(planId: string, conflictAction: 'overwrite' | 'skip') {
  return invoke<TransferTask[]>('enqueue_download', { planId, conflictAction })
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
