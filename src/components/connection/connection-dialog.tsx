import type { StorageProvider } from '@/types/connection'
import { ArrowRightIcon, CloudArrowUpIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useR2Connection } from '@/hooks/use-r2-connection'

interface ConnectionDialogProps {
  open: boolean
  initialProvider: StorageProvider
  onOpenChange: (open: boolean) => void
  onNotice: (message: string) => void
  onConnected?: () => void
}

export function ConnectionDialog({
  open,
  initialProvider,
  onOpenChange,
  onNotice,
  onConnected,
}: ConnectionDialogProps) {
  const { connectionListError, connect } = useR2Connection()
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<StorageProvider>(initialProvider)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [region, setRegion] = useState('')
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
        provider,
        name: name.trim(),
        accountId: accountId ?? '',
        region: provider === 'tencent-cos' ? region.trim() : '',
        endpoint: provider === 'cloudflare-r2' ? endpoint ?? '' : '',
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
    <Dialog open={open} onOpenChange={nextOpen => !busy && onOpenChange(nextOpen)}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] min-h-0 flex-col sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CloudArrowUpIcon className="size-5 text-primary" />
            添加存储连接
          </DialogTitle>
          <DialogDescription>
            选择服务商并填写 Bucket 与凭证。勾选保存后，连接元数据与凭证会保存在本机。
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
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
          <form id="storage-connection-form" className="grid grid-cols-1 gap-4" onSubmit={submitConnection}>
            <div className="flex flex-col gap-2">
              <Label>服务商</Label>
              <ToggleGroup
                variant="outline"
                value={[provider]}
                onValueChange={(value) => {
                  if (value[0] === 'cloudflare-r2' || value[0] === 'tencent-cos')
                    setProvider(value[0])
                }}
                aria-label="存储服务商"
              >
                <ToggleGroupItem value="cloudflare-r2">Cloudflare R2</ToggleGroupItem>
                <ToggleGroupItem value="tencent-cos">腾讯云 COS</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-name">连接名称</Label>
              <Input
                id="r2-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="例如：生产环境"
              />
            </div>
            {provider === 'cloudflare-r2' && (
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
            )}
            {provider === 'tencent-cos' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="cos-region">地域 Region</Label>
                <Input id="cos-region" value={region} onChange={event => setRegion(event.target.value)} placeholder="例如 ap-guangzhou" pattern="[a-z0-9-]+" required />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-bucket">Bucket 名称</Label>
              <Input
                id="r2-bucket"
                autoComplete="off"
                value={bucket ?? ''}
                onChange={event => setBucket(event.target.value)}
                placeholder={provider === 'tencent-cos' ? 'examplebucket-1250000000' : 'my-bucket'}
                required
              />
              {provider === 'tencent-cos' && <p className="text-xs text-muted-foreground">填写包含 APPID 的完整 Bucket 名称。</p>}
            </div>
            {provider === 'cloudflare-r2' && (
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
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-access-key">{provider === 'tencent-cos' ? 'SecretId' : 'Access Key ID'}</Label>
              <Input
                id="r2-access-key"
                autoComplete="off"
                value={accessKeyId ?? ''}
                onChange={event => setAccessKeyId(event.target.value)}
                placeholder={provider === 'tencent-cos' ? '腾讯云 API 密钥的 SecretId' : 'R2 API Token 的 Access Key ID'}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-secret-key">{provider === 'tencent-cos' ? 'SecretKey' : 'Secret Access Key'}</Label>
              <Input
                id="r2-secret-key"
                type="password"
                autoComplete="new-password"
                value={secretAccessKey}
                onChange={event => setSecretAccessKey(event.target.value)}
                placeholder={provider === 'tencent-cos' ? '腾讯云 API 密钥的 SecretKey' : '输入 Secret Access Key'}
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
          </form>
          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {provider === 'tencent-cos'
              ? '请使用有该 Bucket 对象权限的腾讯云子用户密钥。Endpoint 会根据地域自动生成。'
              : '请在 Cloudflare R2 创建对象读权限或读写权限的 S3 API Token，并尽量限制到这个 Bucket。'}
            {' '}
            密钥不会写入普通配置文件；勾选后只存到本机系统凭证库，连接成功后会清空表单中的密钥。
          </p>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form="storage-connection-form" disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : <CloudArrowUpIcon data-icon="inline-start" />}
            {busy ? '正在连接并读取对象…' : '添加并连接'}
            {!busy && <ArrowRightIcon data-icon="inline-end" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
