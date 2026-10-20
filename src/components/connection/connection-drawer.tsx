import { ArrowRightIcon, CheckCircleIcon, CloudArrowUpIcon, XIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { useR2Connection } from '@/store/r2-connection-store'

interface ConnectionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNotice: (message: string) => void
  onConnected?: () => void
}

export function ConnectionDrawer({
  open,
  onOpenChange,
  onNotice,
  onConnected,
}: ConnectionDrawerProps) {
  const { connection, savedConnections, connectionListError, connect } = useR2Connection()
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [accessKeyId, setAccessKeyId] = useState<string | null>(null)
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [bucket, setBucket] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
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
      onOpenChange(false)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="w-[min(32rem,calc(100vw-1rem))]">
        <DrawerHeader className="text-left">
          <div className="flex items-start justify-between gap-4">
            <DrawerTitle className="flex items-center gap-2">
              <CloudArrowUpIcon className="size-5 text-primary" />
              添加存储连接
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="关闭连接抽屉"
              onClick={() => onOpenChange(false)}
            >
              <XIcon />
            </Button>
          </div>
          <DrawerDescription>
            填写 Cloudflare R2 账号和 Bucket 信息。勾选保存后，连接元数据与凭证会保存在本机。
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {connection && (
            <Alert>
              <CheckCircleIcon className="text-emerald-600" />
              <AlertTitle>{`当前连接：${connection.name}`}</AlertTitle>
              <AlertDescription>
                当前预览 Bucket：
                {' '}
                <strong>{connection.bucket}</strong>
                <span className="block break-all">{connection.endpoint}</span>
                {savedConnections.some(item => item.id === connection.connectionId)
                  ? '连接信息已保存到此设备，下次启动时可手动连接。'
                  : '当前凭证仅在应用运行期间有效。'}
              </AlertDescription>
            </Alert>
          )}
          {connectionListError && (
            <Alert variant="destructive">
              <AlertTitle>无法读取已保存的连接</AlertTitle>
              <AlertDescription>{`${connectionListError} 请检查系统凭证库，或重新输入密钥连接。`}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>连接失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form className="grid grid-cols-1 gap-4" onSubmit={submitConnection}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-name">连接名称</Label>
              <Input
                id="r2-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="例如：生产环境"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-account-id">Cloudflare 账号 ID</Label>
              <Input
                id="r2-account-id"
                autoComplete="off"
                value={accountId ?? ''}
                onChange={event => setAccountId(event.target.value)}
                placeholder="32 位账号 ID"
                minLength={32}
                maxLength={32}
                pattern="[0-9a-fA-F]{32}"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-bucket">Bucket 名称</Label>
              <Input
                id="r2-bucket"
                autoComplete="off"
                value={bucket ?? ''}
                onChange={event => setBucket(event.target.value)}
                placeholder="my-bucket"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-endpoint">S3 API Endpoint</Label>
              <Input
                id="r2-endpoint"
                autoComplete="url"
                value={endpoint ?? ''}
                onChange={event => setEndpoint(event.target.value)}
                placeholder={accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '留空时根据账号 ID 自动生成'}
              />
              <p className="text-xs text-muted-foreground">特殊管辖区 Bucket 可填写对应的 Endpoint，例如账号 ID 后带 `.eu` 或 `.us`。</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-access-key">Access Key ID</Label>
              <Input
                id="r2-access-key"
                autoComplete="off"
                value={accessKeyId ?? ''}
                onChange={event => setAccessKeyId(event.target.value)}
                placeholder="R2 API Token 的 Access Key ID"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-secret-key">Secret Access Key</Label>
              <Input
                id="r2-secret-key"
                type="password"
                autoComplete="new-password"
                value={secretAccessKey}
                onChange={event => setSecretAccessKey(event.target.value)}
                placeholder="输入 Secret Access Key"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="r2-remember-connection"
                checked={rememberConnection}
                onCheckedChange={checked => setRememberConnection(checked === true)}
              />
              <Label htmlFor="r2-remember-connection">保存连接信息，供下次使用</Label>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : <CloudArrowUpIcon data-icon="inline-start" />}
              {busy ? '正在连接并读取对象…' : '添加并连接'}
              {!busy && <ArrowRightIcon data-icon="inline-end" />}
            </Button>
          </form>
          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            请在 Cloudflare R2 创建对象读权限或读写权限的 S3 API Token，并尽量限制到这个 Bucket。Access Key ID 与 Secret Access Key 不会写入普通配置文件；勾选后只存到本机系统凭证库，连接成功后会清空表单中的密钥。
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
