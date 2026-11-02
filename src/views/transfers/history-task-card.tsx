import type { TransferTask } from '@/types/transfer'
import {
  ArrowClockwiseIcon,
  ArrowsOutCardinalIcon,
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
} from '@phosphor-icons/react'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { errorMessage, taskErrorMessage } from '@/api/invoke'
import { retryTransferTask } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import i18n from '@/i18n'
import { formatBytes } from '@/lib/format-bytes'
import { showNotice } from '@/lib/notice'
import { formatTaskTarget, statusLabel, taskPercent, terminalStatuses } from './utils'

export interface HistoryTaskCardProps {
  task: TransferTask
  childrenTasks?: TransferTask[]
  onNotice?: (message: string) => void
}

function getHistoryMetrics(task: TransferTask, childrenTasks: TransferTask[]) {
  const isParent = ['folder', 'upload-folder', 'copy-folder', 'move-folder'].includes(task.operation)
  const isCopy = task.operation === 'copy' || task.operation === 'copy-folder'
  const isMove = task.operation === 'move' || task.operation === 'move-folder'
  const percent = taskPercent(task)

  let sizeText: string | null = null
  let percentText: string | null = null

  if (isParent && childrenTasks.length > 0) {
    const processedChildren = childrenTasks.filter(child => terminalStatuses.has(child.status)).length
    const folderPercent = Math.round(processedChildren / childrenTasks.length * 100)
    percentText = `${folderPercent}%`

    if (task.totalBytes !== null && task.totalBytes > 0)
      sizeText = formatBytes(task.totalBytes, 1)
    else
      sizeText = i18n.t('dynamic.childrenCount', { processed: processedChildren, total: childrenTasks.length, kind: isCopy || isMove ? i18n.t('transferUnit.objects') : task.operation === 'upload-folder' ? i18n.t('transferUnit.items') : i18n.t('transferUnit.files') })
  }
  else {
    if (task.status === 'completed') {
      percentText = '100%'
      if (task.totalBytes !== null)
        sizeText = formatBytes(task.totalBytes, 1)
      else if (task.transferredBytes > 0)
        sizeText = formatBytes(task.transferredBytes, 1)
    }
    else {
      if (percent !== null)
        percentText = `${percent}%`

      if (task.totalBytes !== null) {
        if (task.transferredBytes > 0 && task.transferredBytes !== task.totalBytes)
          sizeText = `${formatBytes(task.transferredBytes, 1)} / ${formatBytes(task.totalBytes, 1)}`
        else
          sizeText = formatBytes(task.totalBytes, 1)
      }
      else if (task.transferredBytes > 0) {
        sizeText = formatBytes(task.transferredBytes, 1)
      }
    }
  }

  return { sizeText, percentText }
}

export function HistoryTaskCard({ task, childrenTasks = [], onNotice }: HistoryTaskCardProps) {
  const isParent = ['folder', 'upload-folder', 'copy-folder', 'move-folder'].includes(task.operation)
  const isCopy = task.operation === 'copy' || task.operation === 'copy-folder'
  const isMove = task.operation === 'move' || task.operation === 'move-folder'
  const retryable = ['failed', 'cancelled', 'interrupted'].includes(task.status)
    && (!(isCopy || isMove) || task.phase !== null)
  const { sizeText, percentText } = getHistoryMetrics(task, childrenTasks)
  const locationPath = task.operation === 'download' && ['completed', 'skipped'].includes(task.status)
    ? task.localPath
    : task.operation === 'folder'
      ? childrenTasks.find(child => child.operation === 'download' && ['completed', 'skipped'].includes(child.status))?.localPath
      : undefined

  async function handleAction(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      if (success)
        (onNotice ?? showNotice)(success)
    }
    catch (cause) {
      (onNotice ?? showNotice)(errorMessage(cause))
    }
  }

  async function revealDownloadLocation() {
    if (!locationPath)
      return
    try {
      await revealItemInDir(locationPath)
    }
    catch (cause) {
      if (onNotice)
        onNotice(errorMessage(cause))
      else
        showNotice(errorMessage(cause), 'error')
    }
  }

  return (
    <div className="flex min-w-0 items-start gap-3 border-b px-4 py-3 last:border-b-0">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {task.operation === 'upload'
          ? <CloudArrowUpIcon className="size-4" />
          : task.operation === 'download'
            ? <CloudArrowDownIcon className="size-4" />
            : isCopy
              ? <CopyIcon className="size-4" />
              : isMove
                ? <ArrowsOutCardinalIcon className="size-4" />
                : <FolderIcon className="size-4" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium" title={task.displayName}>{task.displayName}</span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{statusLabel(task.status)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            {sizeText && <span>{sizeText}</span>}
            {percentText && <span className="font-medium text-foreground tabular-nums">{percentText}</span>}
            {locationPath && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={i18n.t('transfers.showDownloadLocation')}
                title={i18n.t('transfers.showDownloadLocation')}
                onClick={() => void revealDownloadLocation()}
              >
                <FolderOpenIcon />
              </Button>
            )}
            {retryable && !isParent && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={i18n.t('transfers.retryTask')}
                onClick={() => void handleAction(() => retryTransferTask(task.id), i18n.t('transfers.taskQueuedAgain'))}
              >
                <ArrowClockwiseIcon />
              </Button>
            )}
          </div>
        </div>
        <span
          className="truncate text-xs text-muted-foreground"
          title={task.operation === 'download' ? task.localPath : `${task.connectionId}:${task.bucket}/${task.objectKey}${task.destinationKey ? ` → ${task.destinationConnectionId || task.connectionId}:${task.destinationBucket || task.bucket}/${task.destinationKey}` : ''}`}
        >
          {formatTaskTarget(task)}
        </span>
        {(task.error || task.errorCode) && <span className="text-xs text-destructive" title={task.error ?? undefined}>{taskErrorMessage(task)}</span>}
        {childrenTasks.length > 0 && (
          <details open={false} className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {childrenTasks.length}
              {' '}
              {i18n.t('transfers.objectTasks')}
            </summary>
            <div className="mt-1 border-l pl-2">
              {childrenTasks.map(child => (
                <HistoryTaskCard key={child.id} task={child} onNotice={onNotice} />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
