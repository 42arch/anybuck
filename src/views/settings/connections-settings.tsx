import { CloudIcon, TrashIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useStorageConnection } from '@/hooks/use-storage-connection'
import { showNotice } from '@/lib/notice'
import { normalizePublicBaseUrl } from '@/lib/object-url'
import { useSettingsStore } from '@/store/settings-store'

interface ConnectionsSettingsProps {
  onNotice?: (message: string) => void
}

export function ConnectionsSettings({ onNotice = showNotice }: ConnectionsSettingsProps) {
  const {
    connection,
    connections,
    savedConnections,
    connectionListError,
    isRestoring,
    forgetSavedConnection,
  } = useStorageConnection()
  const [busyConnectionId, setBusyConnectionId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [publicUrlDrafts, setPublicUrlDrafts] = useState<Record<string, string>>({})
  const { publicBaseUrls, setPublicBaseUrl } = useSettingsStore()
  const savedIds = new Set(savedConnections.map(item => item.id))

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
    <section id="settings-connections" className="flex scroll-mt-4 flex-col gap-2">
      <div className="flex flex-col gap-1 pb-3">
        <h2 className="text-base font-semibold">连接管理</h2>
        <p className="text-xs text-muted-foreground">查看并管理已连接或已保存的云存储连接状态与公开域名。</p>
      </div>

      {connectionListError && (
        <Alert variant="destructive">
          <AlertTitle>无法读取已保存的连接</AlertTitle>
          <AlertDescription>
            {connectionListError}
            {' '}
            请检查系统凭证库，或重新添加连接。
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>连接操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isRestoring && connections.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Spinner />
          正在读取连接…
        </div>
      )}
      {!isRestoring && connections.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <CloudIcon className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">还没有存储连接</p>
            <p className="mt-1 text-xs text-muted-foreground">添加 Cloudflare R2、AWS S3、腾讯云 COS 或阿里云 OSS 连接后，会在这里显示连接详情和状态。</p>
          </div>
        </div>
      )}

      {connections.length > 0 && (
        <div className="flex flex-col gap-3">
          {connections.map((item) => {
            const isSaved = savedIds.has(item.connectionId)
            const isCurrent = connection?.connectionId === item.connectionId
            const isBusy = busyConnectionId === item.connectionId

            return (
              <Card key={item.connectionId} size="sm" className="bg-muted/15 py-0">
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{item.name}</span>
                      <Badge variant={item.connected ? 'secondary' : 'outline'}>
                        {item.connected ? (isCurrent ? '当前连接' : '已连接') : '已断开'}
                      </Badge>
                      <Badge variant="outline">{isSaved ? '已保存' : '仅本次运行'}</Badge>
                      <Badge variant="outline">{item.provider === 'tencent-cos' ? '腾讯云 COS' : item.provider === 'aliyun-oss' ? '阿里云 OSS' : item.provider === 'aws-s3' ? 'AWS S3' : 'Cloudflare R2'}</Badge>
                    </div>
                    {isSaved && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive hover:text-destructive"
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
                      <Button type="submit" variant="outline" className="shrink-0">保存</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.provider === 'cloudflare-r2'
                        ? '填写已启用的 r2.dev 或自定义域名；文件详情会验证匿名访问。'
                        : `可填写自定义域名；留空时检查${item.provider === 'aws-s3' ? ' AWS S3' : item.provider === 'aliyun-oss' ? ' OSS' : ' COS'} 默认对象地址是否可匿名访问。`}
                    </p>
                  </form>
                </CardContent>
              </Card>
            )
          })}
          <p className="text-xs text-muted-foreground">访问密钥保存在系统凭证库中，不会显示在连接列表里。</p>
        </div>
      )}
    </section>
  )
}
