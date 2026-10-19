import { Bell, CaretRight } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

interface AppHeaderProps {
  title: string
  connected: boolean
}

export function AppHeader({ title, connected }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-card px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3 text-xs">
        <SidebarTrigger aria-label="切换侧栏" />
        <Separator orientation="vertical" className="h-5" />
        <span className="hidden text-muted-foreground sm:inline">工作台</span>
        <CaretRight className="hidden size-3 text-muted-foreground sm:inline" />
        <strong className="truncate font-medium">{title}</strong>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={connected ? 'border-[#d8efe4] bg-[#eaf8f2] text-[#449476]' : 'border-[#ffe7d3] bg-[#fff4e9] text-[#a45d2c]'}
        >
          {connected ? 'R2 已连接' : '未连接'}
        </Badge>
        <Button variant="ghost" size="icon" aria-label="通知" disabled>
          <Bell />
        </Button>
      </div>
    </header>
  )
}
