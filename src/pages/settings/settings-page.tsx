import { ArrowRight, CheckCircle, CloudArrowUp } from '@phosphor-icons/react'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { useR2Connection } from '@/features/storage/r2-connection-context'

interface SettingsViewProps {
  onNotice: (message: string) => void
  layout?: 'page' | 'drawer'
  onConnected?: () => void
}

export function SettingsView({ onNotice, layout = 'page', onConnected }: SettingsViewProps) {
  const { connection, connections, savedConnections, connectionListError, connect, forgetSavedConnection } = useR2Connection()
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [accessKeyId, setAccessKeyId] = useState<string | null>(null)
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [bucket, setBucket] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgetBusy, setForgetBusy] = useState(false)
  const [rememberConnection, setRememberConnection] = useState(true)
  const [error, setError] = useState('')

  async function submitConnection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await connect({
        name: name.trim(),
        accountId: accountId ?? '',
        endpoint: endpoint ?? '',
        accessKeyId: accessKeyId ?? '',
        secretAccessKey,
        bucket: bucket ?? '',
        rememberConnection,
      })
      setSecretAccessKey('')
      setAccessKeyId(null)
      onNotice('连接已添加并设为当前连接。')
      onConnected?.()
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setBusy(false)
    }
  }

  async function forgetConnection(connectionId: string, connectionName: string) {
    setForgetBusy(true)
    setError('')
    try {
      await forgetSavedConnection(connectionId)
      onNotice(`已删除连接“${connectionName}”及其本机凭证。`)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setForgetBusy(false)
    }
  }

  return (
    <div className={`flex flex-col gap-4 ${layout === 'page' ? 'max-w-3xl' : 'w-full'}`}>
      <Card className={layout === 'drawer' ? 'border-0 shadow-none' : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudArrowUp className="size-5 text-primary" />
            连接 Cloudflare R2
          </CardTitle>
          <CardDescription>可以添加多个 R2 连接并在侧边栏切换。勾选“记住连接”后，应用会在本机分别保存连接信息和系统凭证；下次启动时连接默认为断开状态。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {connection && (
            <Alert>
              <CheckCircle className="text-emerald-600" />
              <AlertTitle>
                当前连接：
                {connection.name}
              </AlertTitle>
              <AlertDescription>
                当前预览 Bucket：
                <strong>{connection.bucket}</strong>
                <span className="block break-all">{connection.endpoint}</span>
                {savedConnections.some(item => item.id === connection.connectionId) ? '连接信息已保存到此设备，下次启动时可手动连接。' : '当前凭证仅在应用运行期间有效。'}
              </AlertDescription>
            </Alert>
          )}
          {connectionListError && (
            <Alert variant="destructive">
              <AlertTitle>无法读取已保存的连接</AlertTitle>
              <AlertDescription>
                {connectionListError}
                {' '}
                请检查系统凭证库，或重新输入密钥连接。
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>连接失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form className={`grid gap-4 ${layout === 'page' ? 'sm:grid-cols-2' : 'grid-cols-1'}`} onSubmit={submitConnection}>
            <div className={`flex flex-col gap-2 ${layout === 'page' ? 'sm:col-span-2' : ''}`}>
              <Label htmlFor="r2-name">连接名称</Label>
              <Input id="r2-name" value={name} onChange={event => setName(event.target.value)} placeholder="例如：生产环境" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-account-id">Cloudflare 账号 ID</Label>
              <Input id="r2-account-id" autoComplete="off" value={accountId ?? ''} onChange={event => setAccountId(event.target.value)} placeholder="32 位账号 ID" minLength={32} maxLength={32} pattern="[0-9a-fA-F]{32}" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-bucket">Bucket 名称</Label>
              <Input id="r2-bucket" autoComplete="off" value={bucket ?? ''} onChange={event => setBucket(event.target.value)} placeholder="my-bucket" required />
            </div>
            <div className={`flex flex-col gap-2 ${layout === 'page' ? 'sm:col-span-2' : ''}`}>
              <Label htmlFor="r2-endpoint">S3 API Endpoint</Label>
              <Input id="r2-endpoint" autoComplete="url" value={endpoint ?? ''} onChange={event => setEndpoint(event.target.value)} placeholder={accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '留空时根据账号 ID 自动生成'} />
              <p className="text-xs text-muted-foreground">特殊管辖区 Bucket 可填写对应的 Endpoint，例如账号 ID 后带 `.eu` 或 `.us`。</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-access-key">Access Key ID</Label>
              <Input id="r2-access-key" autoComplete="off" value={accessKeyId ?? ''} onChange={event => setAccessKeyId(event.target.value)} placeholder="R2 API Token 的 Access Key ID" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-secret-key">Secret Access Key</Label>
              <Input id="r2-secret-key" type="password" autoComplete="new-password" value={secretAccessKey} onChange={event => setSecretAccessKey(event.target.value)} placeholder="输入 Secret Access Key" required />
            </div>
            <div className={`flex items-center gap-2 ${layout === 'page' ? 'sm:col-span-2' : ''}`}>
              <Checkbox id="r2-remember-connection" checked={rememberConnection} onCheckedChange={checked => setRememberConnection(checked === true)} />
              <Label htmlFor="r2-remember-connection">保存连接信息，供下次使用</Label>
            </div>
            <div className={layout === 'page' ? 'sm:col-span-2' : ''}>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner data-icon="inline-start" /> : <CloudArrowUp data-icon="inline-start" />}
                {busy ? '正在连接并读取对象…' : '添加并连接'}
                {!busy && <ArrowRight data-icon="inline-end" />}
              </Button>
            </div>
          </form>
          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            请在 Cloudflare R2 创建对象读权限或读写权限的 S3 API Token，并尽量限制到这个 Bucket。Access Key ID 与 Secret Access Key 不会写入普通配置文件；勾选后只存到本机系统凭证库，连接成功后会清空表单中的密钥。
          </p>
          {savedConnections.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">已保存的连接</h3>
              {savedConnections.map(saved => (
                <div key={saved.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <span className="min-w-0 text-muted-foreground">
                    <strong className="text-foreground">{saved.name}</strong>
                    <span className="ml-2">{saved.bucket}</span>
                    {connection?.connectionId === saved.id && <Badge className="ml-2" variant="secondary">当前</Badge>}
                  </span>
                  <Button type="button" variant="outline" size="sm" disabled={forgetBusy} onClick={() => void forgetConnection(saved.id, saved.name)}>
                    {forgetBusy && <Spinner data-icon="inline-start" />}
                    删除连接
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <span>Cloudstore 0.1</span>
          {connection && (
            <Badge variant="secondary">
              {connections.filter(item => item.connected).length}
              {' '}
              个已连接
            </Badge>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
