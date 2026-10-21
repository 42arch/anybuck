import type { TransferTask } from '@/types/transfer'
import { SpinnerIcon } from '@phosphor-icons/react'
import { Progress } from '@/components/ui/progress'

interface TransferProgressToastProps {
  tasks: TransferTask[]
}

export function TransferProgressToast({ tasks }: TransferProgressToastProps) {
  const activeTransfer = tasks.find(task => ['upload', 'download', 'copy', 'move'].includes(task.operation) && task.status === 'running')
  if (!activeTransfer)
    return null

  const activeTransferLabel = activeTransfer.operation === 'upload'
    ? '正在上传文件'
    : activeTransfer.operation === 'download'
      ? '正在下载文件'
      : activeTransfer.operation === 'copy'
        ? '正在复制对象'
        : activeTransfer.phase === 'deleting'
          ? '正在删除源对象'
          : '正在移动对象'

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-lg border bg-popover px-4 py-3 text-popover-foreground shadow-lg"
    >
      <SpinnerIcon className="size-4 shrink-0 animate-spin text-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium">{activeTransferLabel}</span>
        <span className="truncate text-xs text-muted-foreground" title={activeTransfer.displayName}>{activeTransfer.displayName}</span>
        {activeTransfer.totalBytes !== null && (
          <div className="flex flex-col gap-1">
            <span className="text-xs tabular-nums text-muted-foreground">
              {`${activeTransfer.totalBytes === 0 ? 0 : Math.min(100, Math.round(activeTransfer.transferredBytes / activeTransfer.totalBytes * 100))}%`}
            </span>
            <Progress
              value={activeTransfer.totalBytes === 0 ? 0 : activeTransfer.transferredBytes / activeTransfer.totalBytes * 100}
              aria-label={`${activeTransfer.displayName} 传输进度`}
            />
          </div>
        )}
      </div>
    </div>
  )
}
