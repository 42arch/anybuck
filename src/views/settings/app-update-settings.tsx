import { DownloadSimpleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { canCheckForUpdates, useAppUpdateQuery } from '@/hooks/use-app-update-query'
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
    <section id="settings-app-update" className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex flex-col gap-1 pb-1">
        <h2 className="text-base font-semibold">应用更新</h2>
        <p className="text-xs text-muted-foreground">{`当前版本：${versionQuery.data ?? (isTauri() ? '读取中' : '开发模式')}。正式安装包启动时自动检查新版本。`}</p>
      </div>

      {!canCheckForUpdates
        ? <p className="text-xs text-muted-foreground">更新检查仅在正式安装的桌面版本中可用。</p>
        : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={updateQuery.isFetching || isBusy}
                  onClick={() => void updateQuery.refetch()}
                >
                  {updateQuery.isFetching && <Spinner data-icon="inline-start" />}
                  检查更新
                </Button>

                {phase === 'idle' && updateQuery.data && (
                  <Button disabled={updateQuery.isFetching} onClick={() => void startUpdate()}>
                    <DownloadSimpleIcon data-icon="inline-start" />
                    下载并安装
                  </Button>
                )}
                {phase === 'ready' && (
                  <Button onClick={() => void installUpdate()}>安装并重启</Button>
                )}
                {phase === 'restart' && (
                  <Button onClick={() => void restartApp()}>重启应用</Button>
                )}
              </div>

              {updateQuery.isError && (
                <Alert variant="destructive">
                  <AlertTitle>检查更新失败</AlertTitle>
                  <AlertDescription>{String(updateQuery.error)}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>更新未完成</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {phase === 'preparing' && <p className="text-xs text-muted-foreground">正在检查传输任务和更新文件。</p>}
              {phase === 'downloading' && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">正在下载更新，请保持应用运行。</p>
                  <Progress value={percent}>
                    <ProgressLabel>下载进度</ProgressLabel>
                    <ProgressValue>{() => totalBytes ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : formatBytes(downloadedBytes)}</ProgressValue>
                  </Progress>
                </div>
              )}
              {phase === 'installing' && <p className="text-xs text-muted-foreground">正在安装更新，应用即将重启。</p>}
              {phase === 'ready' && <p className="text-xs text-muted-foreground">更新已下载。传输任务结束后可继续安装。</p>}
              {phase === 'restart' && <p className="text-xs text-muted-foreground">更新已安装，请重启应用以使用新版本。</p>}

              {updateQuery.data && (
                <Alert>
                  <AlertTitle>{`发现新版本 ${updateQuery.data.version}`}</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">
                    {updateQuery.data.body || '暂无更新说明。'}
                  </AlertDescription>
                </Alert>
              )}
              {updateQuery.isFetched && !updateQuery.data && !updateQuery.isError && (
                <p className="text-xs text-muted-foreground">当前已是最新版本。</p>
              )}
            </>
          )}
    </section>
  )
}
