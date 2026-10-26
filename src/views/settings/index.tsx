import type { SettingsOption } from './types'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AppUpdateSettings } from './app-update-settings'
import { ConnectionsSettings } from './connections-settings'
import { DownloadPathSettings } from './download-path-settings'
import { SettingsSidebar } from './settings-sidebar'
import { settingsItems } from './types'

interface SettingsViewProps {
  onNotice?: (message: string) => void
}

export function SettingsView({ onNotice }: SettingsViewProps) {
  const [activeOption, setActiveOption] = useState<SettingsOption>('connections')
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = scrollContainerRef.current
    if (!root)
      return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find(entry => entry.isIntersecting)
        if (visible) {
          const id = visible.target.id.replace('settings-', '') as SettingsOption
          setActiveOption(id)
        }
      },
      {
        root,
        rootMargin: '-10% 0px -60% 0px',
        threshold: 0,
      },
    )

    const sections = root.querySelectorAll('section[id^="settings-"]')
    sections.forEach(section => observer.observe(section))

    return () => observer.disconnect()
  }, [])

  function scrollToSection(id: SettingsOption) {
    setActiveOption(id)
    const element = document.getElementById(`settings-${id}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="grid h-full min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <SettingsSidebar
        items={settingsItems}
        activeOption={activeOption}
        onSelect={scrollToSection}
      />

      <Card className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden">
        <CardHeader className="shrink-0 border-b pb-4">
          <CardTitle className="text-base font-semibold">设置</CardTitle>
          {/* <CardDescription>管理对象存储连接和本地配置选项。</CardDescription> */}
        </CardHeader>

        <CardContent
          ref={scrollContainerRef}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6"
        >
          <ConnectionsSettings onNotice={onNotice} />
          <Separator />
          <DownloadPathSettings onNotice={onNotice} />
          <Separator />
          <AppUpdateSettings />
        </CardContent>
      </Card>
    </div>
  )
}
