import type { SettingsItem, SettingsOption } from './types'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SettingsSidebarProps {
  items: SettingsItem[]
  activeOption: SettingsOption
  onSelect: (id: SettingsOption) => void
}

export function SettingsSidebar({ items, activeOption, onSelect }: SettingsSidebarProps) {
  const { t } = useTranslation()
  return (
    <Card size="sm" className="h-fit max-h-full overflow-y-auto bg-sidebar text-sidebar-foreground ring-sidebar-border">
      <CardContent className="p-2 sm:p-3">
        <nav aria-label={t('settings.navigation')} className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                variant="ghost"
                className={cn(
                  'justify-start gap-2 font-normal hover:bg-sidebar-surface',
                  activeOption === item.id && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
                aria-current={activeOption === item.id ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <Icon data-icon="inline-start" className={activeOption === item.id ? 'text-sidebar-primary' : undefined} />
                <span>{t(item.labelKey)}</span>
              </Button>
            )
          })}
        </nav>
      </CardContent>
    </Card>
  )
}
