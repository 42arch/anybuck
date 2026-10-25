import type { TransferTask } from '@/types/transfer'
import {
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  CopyIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { clearTransferHistory } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ActiveTaskCard } from './active-task-card'
import { HistoryTaskCard } from './history-task-card'
import { terminalStatuses } from './utils'

export { ActiveTaskCard } from './active-task-card'
export { HistoryTaskCard } from './history-task-card'

interface TransfersViewProps {
  tasks: TransferTask[]
  onNotice: (message: string) => void
}

export function TransfersView({ tasks, onNotice }: TransfersViewProps) {
  const [tab, setTab] = useState<'upload' | 'download' | 'operations'>('upload')

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

  function renderTransferTab(operation: 'upload' | 'download' | 'operations') {
    const tabTasks = tasks.filter(task => operation === 'upload'
      ? ['upload', 'upload-marker', 'upload-folder'].includes(task.operation)
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
      <div key={operation} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
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
              ? activeRoots.map(task => (
                  <ActiveTaskCard
                    key={task.id}
                    task={task}
                    childrenTasks={tabTasks.filter(child => child.parentId === task.id)}
                    onNotice={onNotice}
                  />
                ))
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
              ? [...historyRoots]
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map(task => (
                    <HistoryTaskCard
                      key={task.id}
                      task={task}
                      childrenTasks={tabTasks.filter(child => child.parentId === task.id)}
                      onNotice={onNotice}
                    />
                  ))
              : <p className="px-4 py-8 text-center text-sm text-muted-foreground">暂无历史任务</p>}
          </div>
        </section>
      </div>
    )
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[tab]}
          onValueChange={(value) => {
            if (value.length > 0)
              setTab(value[0] as 'upload' | 'download' | 'operations')
          }}
          aria-label="任务切换"
        >
          <ToggleGroupItem value="upload" aria-label="上传" className="gap-1.5 px-3">
            <CloudArrowUpIcon />
            <span>上传</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="download" aria-label="下载" className="gap-1.5 px-3">
            <CloudArrowDownIcon />
            <span>下载</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="operations" aria-label="复制与移动" className="gap-1.5 px-3">
            <CopyIcon />
            <span>复制与移动</span>
          </ToggleGroupItem>
        </ToggleGroup>
        {renderTransferTab(tab)}
      </CardContent>
    </Card>
  )
}
