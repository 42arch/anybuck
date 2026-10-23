import type { SettingsItem, SettingsOption } from './types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface SettingsSidebarProps {
  items: SettingsItem[]
  activeOption: SettingsOption
  onSelect: (id: SettingsOption) => void
}

export function SettingsSidebar({ items, activeOption, onSelect }: SettingsSidebarProps) {
  return (
    <Card size="sm" className="h-fit max-h-full overflow-y-auto">
      <CardContent className="p-2 sm:p-3">
        <nav aria-label="设置导航" className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                variant={activeOption === item.id ? 'secondary' : 'ghost'}
                // size="sm"
                className="justify-start gap-2 font-normal"
                aria-current={activeOption === item.id ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <Icon data-icon="inline-start" />
                <span>{item.label}</span>
              </Button>
            )
          })}
        </nav>
      </CardContent>
    </Card>
  )
}
