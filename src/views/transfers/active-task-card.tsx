import type { TransferTask } from '@/types/transfer'
import {
  ArrowClockwiseIcon,
  ArrowsOutCardinalIcon,
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  CopyIcon,
  FolderIcon,
  SpinnerIcon,
  XIcon,
} from '@phosphor-icons/react'
import { cancelTransferTask, retryTransferTask } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatBytes } from '@/lib/format-bytes'
import { showNotice } from '@/lib/notice'
import { formatTaskTarget, statusLabels, taskPercent, terminalStatuses } from './utils'

export interface ActiveTaskCardProps {
  task: TransferTask
  childrenTasks?: TransferTask[]
  onNotice?: (message: string) => void
}

export function ActiveTaskCard({ task, childrenTasks = [], onNotice }: ActiveTaskCardProps) {
  const isParent = ['folder', 'upload-folder', 'copy-folder', 'move-folder'].includes(task.operation)
  const isCopy = task.operation === 'copy' || task.operation === 'copy-folder'
  const isMove = task.operation === 'move' || task.operation === 'move-folder'
  const canCancel = ['queued', 'running'].includes(task.status)
  const retryable = ['failed', 'cancelled', 'interrupted'].includes(task.status)
    && (!(isCopy || isMove) || task.phase !== null)
  const percent = taskPercent(task)
  const processedChildren = childrenTasks.filter(child => terminalStatuses.has(child.status)).length
  const phaseLabel = task.status === 'running' && (isCopy || isMove)
    ? task.phase === 'deleting'
      ? '正在删除源对象'
      : task.phase === 'downloading'
        ? '正在读取源对象'
        : task.phase === 'uploading'
          ? '正在上传目标对象'
          : task.phase === 'verifying' ? '正在验证目标对象' : '正在复制'
    : statusLabels[task.status]

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
        {task.status === 'running'
          ? <SpinnerIcon className="size-4 animate-spin text-primary" />
          : task.operation === 'upload'
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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium" title={task.displayName}>{task.displayName}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{phaseLabel}</span>
        </div>
        <span
          className="truncate text-xs text-muted-foreground"
          title={task.operation === 'download' ? task.localPath : `${task.connectionId}:${task.bucket}/${task.objectKey}${task.destinationKey ? ` → ${task.destinationConnectionId || task.connectionId}:${task.destinationBucket || task.bucket}/${task.destinationKey}` : ''}`}
        >
          {formatTaskTarget(task)}
        </span>
        {isParent && childrenTasks.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{`${processedChildren} / ${childrenTasks.length} 个${isCopy || isMove ? '对象' : task.operation === 'upload-folder' ? '项目' : '文件'}已处理`}</span>
              <span>{`${Math.round(processedChildren / childrenTasks.length * 100)}%`}</span>
            </div>
            <Progress value={processedChildren / childrenTasks.length * 100} aria-label={`${task.displayName} 任务进度`} />
          </div>
        )}
        {!isParent && task.status !== 'queued' && task.status !== 'skipped' && (task.totalBytes !== null || task.transferredBytes > 0) && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{`${formatBytes(task.transferredBytes, 1)}${task.totalBytes !== null ? ` / ${formatBytes(task.totalBytes, 1)}` : ''}`}</span>
              <span>{percent !== null ? `${percent}%` : '大小未知'}</span>
            </div>
            {percent !== null && <Progress value={percent} aria-label={`${task.displayName} 传输进度`} />}
          </div>
        )}
        {task.error && <span className="text-xs text-destructive">{task.error}</span>}
        {childrenTasks.length > 0 && (
          <details open={!terminalStatuses.has(task.status)} className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {childrenTasks.length}
              {' '}
              个对象任务
            </summary>
            <div className="mt-1 border-l pl-2">
              {childrenTasks.map(child => (
                <ActiveTaskCard key={child.id} task={child} onNotice={onNotice} />
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canCancel && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="取消任务"
            onClick={() => void handleAction(() => cancelTransferTask(task.id), '任务已取消。')}
          >
            <XIcon />
          </Button>
        )}
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
  )
}
