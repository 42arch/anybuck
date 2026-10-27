import { BellIcon, CaretRightIcon } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

interface AppHeaderProps {
  title: string
  connected: boolean
}

export function AppHeader({ title, connected }: AppHeaderProps) {
  const { t } = useTranslation()
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5 text-xs">
        <SidebarTrigger aria-label={t('nav.toggleSidebar')} />
        <Separator orientation="vertical" className="h-4" />
        <span className="hidden text-muted-foreground sm:inline">{t('nav.workspace')}</span>
        <CaretRightIcon className="hidden size-3 text-muted-foreground sm:inline" />
        <strong className="truncate font-medium">{title}</strong>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={connected ? 'border-status-connected-border bg-status-connected-surface text-status-connected' : 'border-status-disconnected-border bg-status-disconnected-surface text-status-disconnected'}
        >
          {connected ? t('nav.bucketConnected') : t('nav.notConnected')}
        </Badge>
        <Button variant="ghost" size="icon" aria-label={t('nav.notifications')} disabled>
          <BellIcon />
        </Button>
      </div>
    </header>
  )
}
