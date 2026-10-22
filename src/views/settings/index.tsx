import { CloudIcon, DownloadSimpleIcon, FolderOpenIcon, TrashIcon } from '@phosphor-icons/react'
import { open } from '@tauri-apps/plugin-dialog'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { useR2Connection } from '@/hooks/use-r2-connection'
import { normalizePublicBaseUrl } from '@/lib/object-url'
import { useSettingsStore } from '@/store/settings-store'

type SettingsOption = 'connections' | 'download-path'

const settingsGroups: { label: string, items: { id: SettingsOption, label: string }[] }[] = [
  {
    label: '存储',
    items: [{ id: 'connections', label: '连接管理' }],
  },
  {
    label: '下载管理',
    items: [{ id: 'download-path', label: '默认下载路径' }],
  },
]

interface SettingsViewProps {
  onNotice: (message: string) => void
}

export function SettingsView({ onNotice }: SettingsViewProps) {
  const {
    connection,
    connections,
    savedConnections,
    connectionListError,
    isRestoring,
    forgetSavedConnection,
  } = useR2Connection()
  const [selectedOption, setSelectedOption] = useState<SettingsOption>('connections')
  const [busyConnectionId, setBusyConnectionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [publicUrlDrafts, setPublicUrlDrafts] = useState<Record<string, string>>({})
  const [isChoosingDownloadPath, setIsChoosingDownloadPath] = useState(false)
  const { defaultDownloadPath, publicBaseUrls, setDefaultDownloadPath, setPublicBaseUrl } = useSettingsStore()
  const savedIds = new Set(savedConnections.map(item => item.id))

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

  async function runConnectionAction(connectionId: string, action: () => Promise<void>, successMessage: string) {
    setBusyConnectionId(connectionId)
    setError('')
    try {
      await action()
      onNotice(successMessage)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setBusyConnectionId(null)
    }
  }

  function savePublicBaseUrl(connectionId: string) {
    const draft = (publicUrlDrafts[connectionId] ?? publicBaseUrls[connectionId] ?? '').trim()
    const normalized = draft ? normalizePublicBaseUrl(draft) : ''
    if (normalized === null) {
      setError('公开域名必须是完整的 HTTPS 域名，不包含路径、查询参数或账号密码。')
      return
    }
    setPublicBaseUrl(connectionId, normalized)
    setPublicUrlDrafts(current => ({ ...current, [connectionId]: normalized }))
    setError('')
    onNotice(normalized ? '公开访问域名已保存。' : '公开访问域名已清除。')
  }

  return (
    <div className="grid min-h-0 gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="设置选项" className="flex flex-col gap-5">
        {settingsGroups.map(group => (
          <div key={group.label} className="flex flex-col gap-1">
            <h2 className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</h2>
            {group.items.map(item => (
              <Button
                key={item.id}
                variant={selectedOption === item.id ? 'secondary' : 'ghost'}
                className="justify-start"
                aria-current={selectedOption === item.id ? 'page' : undefined}
                onClick={() => setSelectedOption(item.id)}
              >
                {item.id === 'connections'
                  ? <CloudIcon data-icon="inline-start" />
                  : <DownloadSimpleIcon data-icon="inline-start" />}
                {item.label}
              </Button>
            ))}
          </div>
        ))}
      </nav>

      <section className="flex min-w-0 flex-col gap-4" aria-label="设置内容">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{selectedOption === 'connections' ? '连接管理' : '默认下载路径'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedOption === 'connections' ? '查看所有连接及其状态。' : '下载文件和文件夹时默认保存到此目录。'}
            </p>
          </div>
        </div>

        {selectedOption === 'download-path' && (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div>
                <h2 className="text-sm font-medium">默认下载路径</h2>
                <p className="mt-1 text-xs text-muted-foreground">下载操作会直接保存到此位置。该设置保存在本机。</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="默认下载路径"
                  value={defaultDownloadPath || '尚未设置'}
                  readOnly
                  title={defaultDownloadPath || undefined}
                />
                <Button className="shrink-0" variant="outline" disabled={isChoosingDownloadPath} onClick={() => void chooseDownloadPath()}>
                  {isChoosingDownloadPath ? <Spinner data-icon="inline-start" /> : <FolderOpenIcon data-icon="inline-start" />}
                  选择目录
                </Button>
                {defaultDownloadPath && (
                  <Button
                    variant="ghost"
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
            </CardContent>
          </Card>
        )}

        {selectedOption === 'connections' && connectionListError && (
          <Alert variant="destructive">
            <AlertTitle>无法读取已保存的连接</AlertTitle>
            <AlertDescription>
              {connectionListError}
              {' '}
              请检查系统凭证库，或重新添加连接。
            </AlertDescription>
          </Alert>
        )}
        {selectedOption === 'connections' && error && (
          <Alert variant="destructive">
            <AlertTitle>连接操作失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {selectedOption === 'connections' && isRestoring && connections.length === 0 && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner />
            正在读取连接…
          </div>
        )}
        {selectedOption === 'connections' && !isRestoring && connections.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <CloudIcon className="size-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">还没有存储连接</p>
                <p className="mt-1 text-sm text-muted-foreground">添加 Cloudflare R2、AWS S3、腾讯云 COS 或阿里云 OSS 连接后，会在这里显示连接详情和状态。</p>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedOption === 'connections' && (
          <div className="flex flex-col gap-3">
            {connections.map((item) => {
              const isSaved = savedIds.has(item.connectionId)
              const isCurrent = connection?.connectionId === item.connectionId
              const isBusy = busyConnectionId === item.connectionId

              return (
                <Card key={item.connectionId}>
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{item.name}</span>
                        <Badge variant={item.connected ? 'secondary' : 'outline'}>
                          {item.connected ? (isCurrent ? '当前连接' : '已连接') : '已断开'}
                        </Badge>
                        <Badge variant="outline">{isSaved ? '已保存' : '仅本次运行'}</Badge>
                        <Badge variant="outline">{item.provider === 'tencent-cos' ? '腾讯云 COS' : item.provider === 'aliyun-oss' ? '阿里云 OSS' : item.provider === 'aws-s3' ? 'AWS S3' : 'Cloudflare R2'}</Badge>
                      </div>
                      <div className="grid min-w-0 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <p className="truncate">
                          Bucket：
                          {item.bucket}
                        </p>
                        <p className="truncate">
                          Endpoint：
                          {item.endpoint}
                        </p>
                        <p className="break-all font-mono sm:col-span-2">
                          连接 ID：
                          {item.connectionId}
                        </p>
                      </div>
                      <form
                        className="flex min-w-0 flex-col gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          savePublicBaseUrl(item.connectionId)
                        }}
                      >
                        <label htmlFor={`public-domain-${item.connectionId}`} className="text-xs font-medium">公开访问域名</label>
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                          <Input
                            id={`public-domain-${item.connectionId}`}
                            type="url"
                            className="min-w-0"
                            value={publicUrlDrafts[item.connectionId] ?? publicBaseUrls[item.connectionId] ?? ''}
                            onChange={event => setPublicUrlDrafts(current => ({ ...current, [item.connectionId]: event.target.value }))}
                            placeholder={item.provider === 'cloudflare-r2' ? 'https://pub-xxx.r2.dev 或自定义域名' : item.provider === 'aws-s3' ? '留空使用 AWS S3 默认对象地址' : `留空使用${item.provider === 'aliyun-oss' ? ' OSS' : ' COS'} 默认域名`}
                          />
                          <Button type="submit" variant="outline" size="sm" className="shrink-0">保存域名</Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.provider === 'cloudflare-r2'
                            ? '填写已启用的 r2.dev 或自定义域名；文件详情会验证匿名访问。'
                            : `可填写自定义域名；留空时检查${item.provider === 'aws-s3' ? ' AWS S3' : item.provider === 'aliyun-oss' ? ' OSS' : ' COS'} 默认对象地址是否可匿名访问。`}
                        </p>
                      </form>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {isSaved && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={isBusy}
                          onClick={() => void runConnectionAction(item.connectionId, async () => {
                            await forgetSavedConnection(item.connectionId)
                            setPublicBaseUrl(item.connectionId, '')
                          }, `已删除连接“${item.name}”及其本机凭证。`)}
                        >
                          {isBusy ? <Spinner data-icon="inline-start" /> : <TrashIcon data-icon="inline-start" />}
                          删除
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
        {selectedOption === 'connections' && connections.length > 0 && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground">访问密钥保存在系统凭证库中，不会显示在连接列表里。</p>
          </>
        )}
      </section>
    </div>
  )
}
