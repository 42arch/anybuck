import type { DownloadPlanSummary, DownloadR2ObjectsResult, TransferTask } from '@/types/transfer'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

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

export function enqueueR2ObjectOperation(connectionId: string, keys: string[], destinationPrefix: string, operation: 'copy' | 'move') {
  return invoke<TransferTask[]>('enqueue_r2_object_operation', { connectionId, keys, destinationPrefix, operation })
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
