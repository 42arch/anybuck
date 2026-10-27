import { FolderOpenIcon } from '@phosphor-icons/react'
import { open } from '@tauri-apps/plugin-dialog'
import { useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import i18n from '@/i18n'
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
        title: i18n.t('downloadSettings.chooseDefaultDownloadFolder'),
        defaultPath: defaultDownloadPath || undefined,
      })
      if (typeof path === 'string') {
        setDefaultDownloadPath(path)
        onNotice(i18n.t('downloadSettings.defaultDownloadFolderUpdated'))
      }
    }
    catch (cause) {
      onNotice(i18n.t('dynamic.pathSelectionFailed', { message: errorMessage(cause) }))
    }
    finally {
      setIsChoosingDownloadPath(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 pb-3">
        <h2 className="text-base font-semibold">{i18n.t('settings.downloadPath')}</h2>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          aria-label={i18n.t('settings.downloadPath')}
          value={defaultDownloadPath || i18n.t('downloadSettings.notSet')}
          readOnly
          className="min-w-0"
          title={defaultDownloadPath || undefined}
        />
        <Button className="shrink-0" variant="outline" disabled={isChoosingDownloadPath} onClick={() => void chooseDownloadPath()}>
          {isChoosingDownloadPath ? <Spinner data-icon="inline-start" /> : <FolderOpenIcon data-icon="inline-start" />}
          {i18n.t('downloadSettings.chooseFolder')}
        </Button>
        {defaultDownloadPath && (
          <Button
            variant="ghost"
            className="shrink-0 text-destructive hover:text-destructive"
            disabled={isChoosingDownloadPath}
            onClick={() => {
              setDefaultDownloadPath('')
              onNotice(i18n.t('downloadSettings.defaultDownloadFolderCleared'))
            }}
          >
            {i18n.t('common.clear')}
          </Button>
        )}
      </div>
    </section>
  )
}
