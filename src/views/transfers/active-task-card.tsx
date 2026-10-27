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
import { errorMessage, taskErrorMessage } from '@/api/invoke'
import { cancelTransferTask, retryTransferTask } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import i18n from '@/i18n'
import { formatBytes } from '@/lib/format-bytes'
import { showNotice } from '@/lib/notice'
import { formatTaskTarget, statusLabel, taskPercent, terminalStatuses } from './utils'

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
      ? i18n.t('transferPhase.deletingSource')
      : task.phase === 'downloading'
        ? i18n.t('transferPhase.readingSource')
        : task.phase === 'uploading'
          ? i18n.t('transferPhase.uploadingDestination')
          : task.phase === 'verifying' ? i18n.t('transferPhase.verifyingDestination') : i18n.t('activeTask.copying')
    : statusLabel(task.status)

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
              <span>{i18n.t('dynamic.childrenProcessed', { processed: processedChildren, total: childrenTasks.length, kind: isCopy || isMove ? i18n.t('transferUnit.objects') : task.operation === 'upload-folder' ? i18n.t('transferUnit.items') : i18n.t('transferUnit.files') })}</span>
              <span>{`${Math.round(processedChildren / childrenTasks.length * 100)}%`}</span>
            </div>
            <Progress value={processedChildren / childrenTasks.length * 100} aria-label={i18n.t('dynamic.taskProgress', { name: task.displayName })} />
          </div>
        )}
        {!isParent && task.status !== 'queued' && task.status !== 'skipped' && (task.totalBytes !== null || task.transferredBytes > 0) && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{`${formatBytes(task.transferredBytes, 1)}${task.totalBytes !== null ? ` / ${formatBytes(task.totalBytes, 1)}` : ''}`}</span>
              <span>{percent !== null ? `${percent}%` : i18n.t('activeTask.sizeUnknown')}</span>
            </div>
            {percent !== null && <Progress value={percent} aria-label={i18n.t('dynamic.transferProgress', { name: task.displayName })} />}
          </div>
        )}
        {(task.error || task.errorCode) && <span className="text-xs text-destructive" title={task.error ?? undefined}>{taskErrorMessage(task)}</span>}
        {childrenTasks.length > 0 && (
          <details open={!terminalStatuses.has(task.status)} className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {childrenTasks.length}
              {' '}
              {i18n.t('transfers.objectTasks')}
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
            aria-label={i18n.t('activeTask.cancelTask')}
            onClick={() => void handleAction(() => cancelTransferTask(task.id), i18n.t('activeTask.taskCancelled'))}
          >
            <XIcon />
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
  )
}
