import type { TransferTask } from '@/types/transfer'
import { ArrowsLeftRightIcon, SpinnerIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

interface AppHeaderProps {
  title: string
  connected: boolean
  tasks: TransferTask[]
  onViewTransfers: () => void
}

export function AppHeader({ title, connected, tasks, onViewTransfers }: AppHeaderProps) {
  const { t } = useTranslation()
  const [transferPreviewOpen, setTransferPreviewOpen] = useState(false)
  const activeTasks = tasks
    .filter(task => task.parentId === null && ['queued', 'running'].includes(task.status))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const hasActiveTasks = activeTasks.length > 0

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5 text-xs">
        <SidebarTrigger aria-label={t('nav.toggleSidebar')} />
        <Separator orientation="vertical" className="h-4" />
        <strong className="truncate font-medium">{title}</strong>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={connected ? 'border-status-connected-border bg-status-connected-surface text-status-connected' : 'border-status-disconnected-border bg-status-disconnected-surface text-status-disconnected'}
        >
          {connected ? t('nav.bucketConnected') : t('nav.notConnected')}
        </Badge>
        <HoverCard open={transferPreviewOpen} onOpenChange={setTransferPreviewOpen}>
          <HoverCardTrigger
            render={(
              <Button
                variant="ghost"
                size="icon"
                className="text-primary hover:text-primary/80"
                aria-label={t('transferPreview.open')}
                onClick={() => setTransferPreviewOpen(true)}
              >
                {hasActiveTasks
                  ? <SpinnerIcon className="animate-spin text-primary" />
                  : <ArrowsLeftRightIcon className="text-primary" />}
              </Button>
            )}
          />
          <HoverCardContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <strong className="font-medium">{t('transferPreview.title')}</strong>
              <span className="text-muted-foreground">{activeTasks.length}</span>
            </div>
            {hasActiveTasks
              ? (
                <ul className="max-h-60 divide-y overflow-y-auto">
                  {activeTasks.slice(0, 5).map(task => (
                    <li key={task.id} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate">{task.displayName}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {t(task.status === 'running' ? 'transferStatus.transferring' : 'transferStatus.queued')}
                      </span>
                    </li>
                  ))}
                </ul>
              )
              : <p className="px-3 py-4 text-center text-muted-foreground">{t('transferPreview.empty')}</p>}
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full" onClick={onViewTransfers}>
                {t('transferPreview.viewAll')}
              </Button>
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>
    </header>
  )
}
