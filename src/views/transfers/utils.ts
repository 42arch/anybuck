import type { TransferTask } from '@/types/transfer'
import i18n from '@/i18n'

export const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'skipped'])

const statusKeys: Record<TransferTask['status'], string> = {
  queued: 'transferStatus.queued',
  running: 'transferStatus.transferring',
  completed: 'transferStatus.completed',
  failed: 'common.failed',
  cancelled: 'transferStatus.cancelled',
  interrupted: 'transferStatus.interrupted',
  skipped: 'transferStatus.skipped',
}

export function statusLabel(status: TransferTask['status']): string {
  return i18n.t(statusKeys[status])
}

export function taskPercent(task: TransferTask): number | null {
  if (task.totalBytes === null)
    return null
  if (task.totalBytes === 0)
    return task.status === 'completed' ? 100 : 0
  return Math.min(100, Math.round(task.transferredBytes / task.totalBytes * 100))
}

export function formatTaskTarget(task: TransferTask): string {
  if (task.operation === 'upload' || task.operation === 'upload-marker' || task.operation === 'upload-folder')
    return i18n.t('dynamic.uploadTo', { path: `${task.bucket}/${task.objectKey}` })
  if (task.operation === 'download')
    return i18n.t('dynamic.saveTo', { path: task.localPath })
  if (task.operation === 'copy' || task.operation === 'move')
    return `${task.destinationConnectionId && task.destinationConnectionId !== task.connectionId ? i18n.t('transferStatus.crossConnection') : ''}${task.bucket}/${task.objectKey} → ${task.destinationBucket || task.bucket}/${task.destinationKey}`
  if (task.operation === 'copy-folder' || task.operation === 'move-folder')
    return `${task.destinationConnectionId && task.destinationConnectionId !== task.connectionId ? i18n.t('transferStatus.crossConnection') : ''}${task.bucket}/${task.objectKey} → ${task.destinationBucket || task.bucket}/${task.destinationKey}`
  return i18n.t('dynamic.downloadFrom', { path: `${task.bucket}/${task.objectKey}` })
}
