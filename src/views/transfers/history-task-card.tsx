import type { TransferTask } from '@/types/transfer'
import {
  ArrowClockwiseIcon,
  ArrowsOutCardinalIcon,
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  CopyIcon,
  FolderIcon,
} from '@phosphor-icons/react'
import { retryTransferTask } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/format-bytes'
import { showNotice } from '@/lib/notice'
import { formatTaskTarget, statusLabels, taskPercent, terminalStatuses } from './utils'

export interface HistoryTaskCardProps {
  task: TransferTask
  childrenTasks?: TransferTask[]
  onNotice?: (message: string) => void
}

function getHistoryMetrics(task: TransferTask, childrenTasks: TransferTask[]) {
  const isParent = ['folder', 'copy-folder', 'move-folder'].includes(task.operation)
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
      sizeText = `${processedChildren}/${childrenTasks.length} 个${isCopy || isMove ? '对象' : '文件'}`
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
  const isParent = ['folder', 'copy-folder', 'move-folder'].includes(task.operation)
  const isCopy = task.operation === 'copy' || task.operation === 'copy-folder'
  const isMove = task.operation === 'move' || task.operation === 'move-folder'
  const retryable = ['failed', 'cancelled', 'interrupted'].includes(task.status)
    && (!(isCopy || isMove) || task.phase !== null)
  const { sizeText, percentText } = getHistoryMetrics(task, childrenTasks)

  async function handleAction(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      if (success)
        (onNotice ?? showNotice)(success)
    }
    catch (cause) {
      (onNotice ?? showNotice)(cause instanceof Error ? cause.message : String(cause))
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
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{statusLabels[task.status]}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            {sizeText && <span>{sizeText}</span>}
            {percentText && <span className="font-medium text-foreground tabular-nums">{percentText}</span>}
            {retryable && !isParent && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="重试任务"
                onClick={() => void handleAction(() => retryTransferTask(task.id), '任务已重新排队。')}
              >
                <ArrowClockwiseIcon />
              </Button>
            )}
          </div>
        </div>
        <span
          className="truncate text-xs text-muted-foreground"
          title={task.operation === 'download' ? task.localPath : `${task.bucket}/${task.objectKey}`}
        >
          {formatTaskTarget(task)}
        </span>
        {task.error && <span className="text-xs text-destructive">{task.error}</span>}
        {childrenTasks.length > 0 && (
          <details open={false} className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {childrenTasks.length}
              {' '}
              个对象任务
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
