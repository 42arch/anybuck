import type { DownloadObjectsResult, DownloadPlanSummary, TransferTask, UploadConflictAction } from '@/types/transfer'
import { listen } from '@tauri-apps/api/event'
import { invokeCommand } from '@/api/invoke'

export function uploadFile(connectionId: string, prefix: string, localPath: string) {
  return invokeCommand<void>('upload_file', { connectionId, prefix, localPath })
}

export function downloadObjects(connectionId: string, prefix: string, keys: string[], destinationPath: string) {
  return invokeCommand<DownloadObjectsResult>('download_objects', {
    connectionId,
    prefix,
    keys,
    destinationPath,
  })
}

export function listTransferTasks() {
  return invokeCommand<TransferTask[]>('list_transfer_tasks')
}

export function onTransferTaskUpdated(callback: (task: TransferTask) => void) {
  return listen<TransferTask>('transfer-task-updated', event => callback(event.payload))
}

export function onTransferHistoryCleared(callback: () => void) {
  return listen('transfer-history-cleared', callback)
}

export function enqueueUploads(connectionId: string, prefix: string, localPaths: string[], uploadConflictAction: UploadConflictAction) {
  return invokeCommand<TransferTask[]>('enqueue_uploads', { connectionId, prefix, localPaths, uploadConflictAction })
}

export function enqueueObjectOperation(connectionId: string, destinationConnectionId: string, keys: string[], destinationPrefix: string, operation: 'copy' | 'move') {
  return invokeCommand<TransferTask[]>('enqueue_object_operation', { connectionId, destinationConnectionId, keys, destinationPrefix, operation })
}

export function prepareDownload(connectionId: string, prefix: string, keys: string[], destinationPath: string) {
  return invokeCommand<DownloadPlanSummary>('prepare_download', { connectionId, prefix, keys, destinationPath })
}

export function enqueueDownload(planId: string, conflictAction: 'overwrite' | 'skip') {
  return invokeCommand<TransferTask[]>('enqueue_download', { planId, conflictAction })
}

export function cancelTransferTask(taskId: string) {
  return invokeCommand<void>('cancel_transfer_task', { taskId })
}

export function retryTransferTask(taskId: string) {
  return invokeCommand<TransferTask>('retry_transfer_task', { taskId })
}

export function clearTransferHistory() {
  return invokeCommand<void>('clear_transfer_history')
}
