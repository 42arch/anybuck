import type { TransferTask } from '@/types/transfer'
import {
  CloudArrowDownIcon,
  CloudArrowUpIcon,
  CopyIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { clearTransferHistory } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import i18n from '@/i18n'
import { cn } from '@/lib/utils'
import { ActiveTaskCard } from './active-task-card'
import { HistoryTaskCard } from './history-task-card'
import { terminalStatuses } from './utils'

export { ActiveTaskCard } from './active-task-card'
export { HistoryTaskCard } from './history-task-card'

const sidebarActiveToggleClass = 'data-[state=on]:bg-sidebar-accent data-[state=on]:text-sidebar-accent-foreground data-[state=on]:hover:bg-sidebar-accent data-[state=on]:hover:text-sidebar-accent-foreground'

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
      onNotice(errorMessage(cause))
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
    const taskTitle = operation === 'upload' ? i18n.t('transfers.uploadTasks') : operation === 'download' ? i18n.t('transfers.downloadTasks') : i18n.t('transfers.copyMoveTasks')
    const TaskIcon = operation === 'upload' ? CloudArrowUpIcon : operation === 'download' ? CloudArrowDownIcon : CopyIcon

    return (
      <div key={operation} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-medium">{i18n.t('transfers.running')}</h2>
            <span className="text-xs text-muted-foreground">
              {activeRoots.length}
              {' '}
              {i18n.t('transfers.activeTaskUnit')}
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
                      <EmptyTitle>{i18n.t('transfers.noActiveTasks')}</EmptyTitle>
                      <EmptyDescription>
                        {taskTitle}
                        {' '}
                        {i18n.t('transfers.emptyDescriptionSuffix')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-medium">{i18n.t('transfers.history')}</h2>
              <p className="text-xs text-muted-foreground">{i18n.t('transfers.recentlyCompletedTasksKept')}</p>
            </div>
            {historyTasks.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => void runAction(clearTransferHistory, i18n.t('transfers.historyCleared'))}>
                <TrashIcon data-icon="inline-start" />
                {i18n.t('transfers.clearHistory')}
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
              : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{i18n.t('transfers.noTaskHistory')}</p>}
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
          aria-label={i18n.t('transfers.taskSwitcher')}
        >
          <ToggleGroupItem value="upload" aria-label={i18n.t('common.upload')} className={cn('gap-1.5 px-3', sidebarActiveToggleClass)}>
            <CloudArrowUpIcon />
            <span>{i18n.t('common.upload')}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="download" aria-label={i18n.t('common.download')} className={cn('gap-1.5 px-3', sidebarActiveToggleClass)}>
            <CloudArrowDownIcon />
            <span>{i18n.t('common.download')}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="operations" aria-label={i18n.t('transfers.copyMove')} className={cn('gap-1.5 px-3', sidebarActiveToggleClass)}>
            <CopyIcon />
            <span>{i18n.t('transfers.copyMove')}</span>
          </ToggleGroupItem>
        </ToggleGroup>
        {renderTransferTab(tab)}
      </CardContent>
    </Card>
  )
}
