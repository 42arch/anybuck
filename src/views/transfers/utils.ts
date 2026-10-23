import type { TransferTask } from '@/types/transfer'

export const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'skipped'])

export const statusLabels: Record<TransferTask['status'], string> = {
  queued: '排队中',
  running: '传输中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
  skipped: '已跳过',
}

export function taskPercent(task: TransferTask): number | null {
  if (task.totalBytes === null)
    return null
  if (task.totalBytes === 0)
    return task.status === 'completed' ? 100 : 0
  return Math.min(100, Math.round(task.transferredBytes / task.totalBytes * 100))
}

export function formatTaskTarget(task: TransferTask): string {
  if (task.operation === 'upload')
    return `上传到 ${task.bucket}/${task.objectKey}`
  if (task.operation === 'download')
    return `保存到 ${task.localPath}`
  if (task.operation === 'copy' || task.operation === 'move')
    return `${task.bucket}/${task.objectKey} → ${task.bucket}/${task.destinationKey}`
  return `下载 ${task.bucket}/${task.objectKey}`
}
