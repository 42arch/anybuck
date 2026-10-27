import type { SettingsOption } from './types'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AppUpdateSettings } from './app-update-settings'
import { ConnectionsSettings } from './connections-settings'
import { DownloadPathSettings } from './download-path-settings'
import { LanguageSettings } from './language-settings'
import { SettingsSidebar } from './settings-sidebar'
import { ThemeSettings } from './theme-settings'
import { settingsItems } from './types'

interface SettingsViewProps {
  onNotice?: (message: string) => void
}

export function SettingsView({ onNotice }: SettingsViewProps) {
  const [activeOption, setActiveOption] = useState<SettingsOption>('general')

  function renderActiveSettings() {
    switch (activeOption) {
      case 'connections':
        return <ConnectionsSettings onNotice={onNotice} />
      case 'general':
        return (
          <div className="flex flex-col gap-4">
            <LanguageSettings />
            <Separator />
            <ThemeSettings />
            <Separator />
            <DownloadPathSettings onNotice={onNotice} />
          </div>
        )
      case 'app-update':
        return <AppUpdateSettings />
    }
  }

  return (
    <div className="grid h-full min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <SettingsSidebar
        items={settingsItems}
        activeOption={activeOption}
        onSelect={setActiveOption}
      />

      <Card className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
          {renderActiveSettings()}
        </CardContent>
      </Card>
    </div>
  )
}
