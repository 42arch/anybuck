import type { TransferTask } from '@/types/transfer'
import {
  ArrowClockwiseIcon,
  ArrowsOutCardinalIcon,
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  CopyIcon,
  FolderIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react'
import { cancelTransferTask, clearTransferHistory, retryTransferTask } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatBytes } from '@/lib/format-bytes'

interface TransfersViewProps {
  tasks: TransferTask[]
  onNotice: (message: string) => void
}

const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'skipped'])
const statusLabels: Record<TransferTask['status'], string> = {
  queued: '排队中',
  running: '传输中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
  skipped: '已跳过',
}

function taskPercent(task: TransferTask) {
  if (task.totalBytes === null)
    return null
  if (task.totalBytes === 0)
    return task.status === 'completed' ? 100 : 0
  return Math.min(100, Math.round(task.transferredBytes / task.totalBytes * 100))
}

export function TransfersView({ tasks, onNotice }: TransfersViewProps) {
  async function runAction(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      if (success)
        onNotice(success)
    }
    catch (cause) {
      onNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function renderTask(task: TransferTask, children: TransferTask[] = []) {
    const isParent = ['folder', 'copy-folder', 'move-folder'].includes(task.operation)
    const isCopy = task.operation === 'copy' || task.operation === 'copy-folder'
    const isMove = task.operation === 'move' || task.operation === 'move-folder'
    const retryable = ['failed', 'cancelled', 'interrupted'].includes(task.status)
      && (!(isCopy || isMove) || task.phase !== null)
    const canCancel = ['queued', 'running'].includes(task.status)
    const percent = taskPercent(task)
    const processedChildren = children.filter(child => terminalStatuses.has(child.status)).length
    const phaseLabel = task.status === 'running' && (isCopy || isMove)
      ? task.phase === 'deleting' ? '正在删除源对象' : '正在复制'
      : statusLabels[task.status]
    return (
      <div key={task.id} className="flex min-w-0 items-start gap-3 border-b px-4 py-3 last:border-b-0">
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
          <span className="truncate text-xs text-muted-foreground" title={task.operation === 'download' ? task.localPath : `${task.bucket}/${task.objectKey}`}>
            {task.operation === 'upload'
              ? `上传到 ${task.bucket}/${task.objectKey}`
              : task.operation === 'download'
                ? `保存到 ${task.localPath}`
                : isCopy || isMove
                  ? `${task.bucket}/${task.objectKey} → ${task.bucket}/${task.destinationKey}`
                  : `下载 ${task.bucket}/${task.objectKey}`}
          </span>
          {isParent && children.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{`${processedChildren} / ${children.length} 个${isCopy || isMove ? '对象' : '文件'}已处理`}</span>
                <span>{`${Math.round(processedChildren / children.length * 100)}%`}</span>
              </div>
              <Progress value={processedChildren / children.length * 100} aria-label={`${task.displayName} 任务进度`} />
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
          {children.length > 0 && (
            <details open={!terminalStatuses.has(task.status)} className="mt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {children.length}
                {' '}
                个对象任务
              </summary>
              <div className="mt-1 border-l pl-2">{children.map(child => renderTask(child))}</div>
            </details>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canCancel && <Button size="icon-sm" variant="ghost" aria-label="取消任务" onClick={() => void runAction(() => cancelTransferTask(task.id), '任务已取消。')}><XIcon /></Button>}
          {retryable && !isParent && <Button size="icon-sm" variant="ghost" aria-label="重试任务" onClick={() => void runAction(() => retryTransferTask(task.id), '任务已重新排队。')}><ArrowClockwiseIcon /></Button>}
        </div>
      </div>
    )
  }

  function renderTransferTab(operation: 'upload' | 'download' | 'operations') {
    const tabTasks = tasks.filter(task => operation === 'upload'
      ? task.operation === 'upload'
      : operation === 'download'
        ? task.operation === 'download' || task.operation === 'folder'
        : ['copy', 'move', 'copy-folder', 'move-folder'].includes(task.operation))
    const roots = tabTasks.filter(task => task.parentId === null)
    const activeRoots = roots.filter(task => !terminalStatuses.has(task.status))
    const historyRoots = roots.filter(task => terminalStatuses.has(task.status))
    const historyTasks = tabTasks.filter(task => terminalStatuses.has(task.status))
    const taskTitle = operation === 'upload' ? '上传任务' : operation === 'download' ? '下载任务' : '复制和移动任务'
    const TaskIcon = operation === 'upload' ? CloudArrowUpIcon : operation === 'download' ? CloudArrowDownIcon : CopyIcon

    return (
      <TabsContent value={operation} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-medium">正在执行</h2>
            <span className="text-xs text-muted-foreground">
              {activeRoots.length}
              {' '}
              项
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border">
            {activeRoots.length > 0
              ? activeRoots.map(task => renderTask(task, tabTasks.filter(child => child.parentId === task.id)))
              : (
                  <Empty className="border-0 py-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><TaskIcon /></EmptyMedia>
                      <EmptyTitle>没有进行中的任务</EmptyTitle>
                      <EmptyDescription>
                        {taskTitle}
                        会显示在这里。
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-medium">历史记录</h2>
              <p className="text-xs text-muted-foreground">保留最近结束的任务</p>
            </div>
            {historyTasks.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => void runAction(clearTransferHistory, '历史记录已清理。')}>
                <TrashIcon data-icon="inline-start" />
                清理历史
              </Button>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border">
            {historyRoots.length > 0
              ? [...historyRoots].sort((a, b) => b.updatedAt - a.updatedAt).map(task => renderTask(task, tabTasks.filter(child => child.parentId === task.id)))
              : <p className="px-4 py-8 text-center text-sm text-muted-foreground">暂无历史任务</p>}
          </div>
        </section>
      </TabsContent>
    )
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Tabs defaultValue="upload" className="min-h-0 flex-1">
          <TabsList className="w-full sm:w-1/2">
            <TabsTrigger value="upload" className="hover:bg-foreground/5 hover:text-foreground/60 data-active:bg-primary data-active:text-primary-foreground data-active:hover:bg-primary/90 data-active:hover:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground">
              <CloudArrowUpIcon />
              上传
            </TabsTrigger>
            <TabsTrigger value="download" className="hover:bg-foreground/5 hover:text-foreground/60 data-active:bg-primary data-active:text-primary-foreground data-active:hover:bg-primary/90 data-active:hover:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground">
              <CloudArrowDownIcon />
              下载
            </TabsTrigger>
            <TabsTrigger value="operations" className="hover:bg-foreground/5 hover:text-foreground/60 data-active:bg-primary data-active:text-primary-foreground data-active:hover:bg-primary/90 data-active:hover:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground">
              <CopyIcon />
              复制与移动
            </TabsTrigger>
          </TabsList>
          {renderTransferTab('upload')}
          {renderTransferTab('download')}
          {renderTransferTab('operations')}
        </Tabs>
      </CardContent>
    </Card>
  )
}
