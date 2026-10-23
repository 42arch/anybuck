import { FolderOpenIcon } from '@phosphor-icons/react'
import { open } from '@tauri-apps/plugin-dialog'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { showNotice } from '@/lib/notice'
import { useSettingsStore } from '@/store/settings-store'

interface DownloadPathSettingsProps {
  onNotice?: (message: string) => void
}

export function DownloadPathSettings({ onNotice = showNotice }: DownloadPathSettingsProps) {
  const [isChoosingDownloadPath, setIsChoosingDownloadPath] = useState(false)
  const { defaultDownloadPath, setDefaultDownloadPath } = useSettingsStore()

  async function chooseDownloadPath() {
    setIsChoosingDownloadPath(true)
    try {
      const path = await open({
        directory: true,
        multiple: false,
        title: '选择默认下载路径',
        defaultPath: defaultDownloadPath || undefined,
      })
      if (typeof path === 'string') {
        setDefaultDownloadPath(path)
        onNotice('默认下载路径已更新。')
      }
    }
    catch (cause) {
      onNotice(`无法选择下载路径：${cause instanceof Error ? cause.message : String(cause)}`)
    }
    finally {
      setIsChoosingDownloadPath(false)
    }
  }

  return (
    <section id="settings-download-path" className="flex scroll-mt-4 flex-col gap-2">
      <div className="flex flex-col gap-1 pb-3">
        <h2 className="text-base font-semibold">默认下载路径</h2>
        <p className="text-xs text-muted-foreground">文件和文件夹下载任务的默认保存目录。该配置保存在本机。</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          aria-label="默认下载路径"
          value={defaultDownloadPath || '尚未设置'}
          readOnly
          className="min-w-0"
          title={defaultDownloadPath || undefined}
        />
        <Button className="shrink-0" variant="outline" disabled={isChoosingDownloadPath} onClick={() => void chooseDownloadPath()}>
          {isChoosingDownloadPath ? <Spinner data-icon="inline-start" /> : <FolderOpenIcon data-icon="inline-start" />}
          选择目录
        </Button>
        {defaultDownloadPath && (
          <Button
            variant="ghost"
            className="shrink-0 text-destructive hover:text-destructive"
            disabled={isChoosingDownloadPath}
            onClick={() => {
              setDefaultDownloadPath('')
              onNotice('默认下载路径已清除。')
            }}
          >
            清除
          </Button>
        )}
      </div>
    </section>
  )
}
