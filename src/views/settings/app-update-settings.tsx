import { DownloadSimpleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { canCheckForUpdates, useAppUpdateQuery } from '@/hooks/use-app-update-query'
import i18n from '@/i18n'
import { formatBytes } from '@/lib/format-bytes'
import { useAppUpdateStore } from '@/store/app-update-store'

export function AppUpdateSettings() {
  const updateQuery = useAppUpdateQuery()
  const versionQuery = useQuery({
    queryKey: ['app-version'],
    queryFn: getVersion,
    enabled: isTauri(),
    staleTime: Infinity,
    retry: false,
  })
  const { phase, downloadedBytes, totalBytes, error, startUpdate, installUpdate, restartApp } = useAppUpdateStore()
  const percent = totalBytes && totalBytes > 0
    ? Math.min(100, Math.round(downloadedBytes / totalBytes * 100))
    : null
  const isBusy = phase === 'preparing' || phase === 'downloading' || phase === 'installing'

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 pb-1">
        <h2 className="text-base font-semibold">{i18n.t('settings.appUpdate')}</h2>
        <p className="text-xs text-muted-foreground">{i18n.t('dynamic.updateVersion', { version: versionQuery.data ?? (isTauri() ? i18n.t('appUpdate.loading') : i18n.t('appUpdate.developmentMode')) })}</p>
      </div>

      {!canCheckForUpdates
        ? <p className="text-xs text-muted-foreground">{i18n.t('appUpdate.installedBuildsOnlyHint')}</p>
        : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={updateQuery.isFetching || isBusy}
                  onClick={() => void updateQuery.refetch()}
                >
                  {updateQuery.isFetching && <Spinner data-icon="inline-start" />}
                  {i18n.t('appUpdate.checkUpdates')}
                </Button>

                {phase === 'idle' && updateQuery.data && (
                  <Button disabled={updateQuery.isFetching} onClick={() => void startUpdate()}>
                    <DownloadSimpleIcon data-icon="inline-start" />
                    {i18n.t('appUpdate.downloadInstall')}
                  </Button>
                )}
                {phase === 'ready' && (
                  <Button onClick={() => void installUpdate()}>{i18n.t('appUpdate.installRestart')}</Button>
                )}
                {phase === 'restart' && (
                  <Button onClick={() => void restartApp()}>{i18n.t('appUpdate.restartApp')}</Button>
                )}
              </div>

              {updateQuery.isError && (
                <Alert variant="destructive">
                  <AlertTitle>{i18n.t('appUpdate.updateCheckFailed')}</AlertTitle>
                  <AlertDescription>{String(updateQuery.error)}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>{i18n.t('appUpdate.updateIncomplete')}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {phase === 'preparing' && <p className="text-xs text-muted-foreground">{i18n.t('appUpdate.checkingTransferTasksUpdateFiles')}</p>}
              {phase === 'downloading' && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">{i18n.t('appUpdate.downloadingUpdateKeepAppOpen')}</p>
                  <Progress value={percent}>
                    <ProgressLabel>{i18n.t('appUpdate.downloadProgress')}</ProgressLabel>
                    <ProgressValue>{() => totalBytes ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : formatBytes(downloadedBytes)}</ProgressValue>
                  </Progress>
                </div>
              )}
              {phase === 'installing' && <p className="text-xs text-muted-foreground">{i18n.t('appUpdate.installingUpdateAppRestartSoon')}</p>}
              {phase === 'ready' && <p className="text-xs text-muted-foreground">{i18n.t('appUpdate.downloadedPendingTransfersHint')}</p>}
              {phase === 'restart' && <p className="text-xs text-muted-foreground">{i18n.t('appUpdate.restartRequiredHint')}</p>}

              {updateQuery.data && (
                <Alert>
                  <AlertTitle>{i18n.t('dynamic.newVersion', { version: updateQuery.data.version })}</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">
                    {updateQuery.data.body || i18n.t('appUpdate.noReleaseNotesAvailable')}
                  </AlertDescription>
                </Alert>
              )}
              {updateQuery.isFetched && !updateQuery.data && !updateQuery.isError && (
                <p className="text-xs text-muted-foreground">{i18n.t('appUpdate.usingLatestVersion')}</p>
              )}
            </>
          )}
    </section>
  )
}
