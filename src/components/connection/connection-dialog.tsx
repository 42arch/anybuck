import type { SavedStorageConnection, StorageProvider } from '@/types/connection'
import { ArrowRightIcon, CloudArrowUpIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useStorageConnection } from '@/hooks/use-storage-connection'

import { showNotice } from '@/lib/notice'
import { useConnectionDialogStore } from '@/store/connection-dialog-store'

interface ConnectionDialogProps {
  open?: boolean
  initialProvider?: StorageProvider
  editProfile?: SavedStorageConnection
  onOpenChange?: (open: boolean) => void
  onNotice?: (message: string) => void
  onConnected?: () => void
}

const providerLabels: Record<StorageProvider, string> = {
  'cloudflare-r2': 'Cloudflare R2',
  'aws-s3': 'AWS S3',
  'tencent-cos': '腾讯云 COS',
  'aliyun-oss': '阿里云 OSS',
  'google-cloud-storage': 'Google Cloud Storage',
  'qiniu-kodo': '七牛云 Kodo',
  'volcengine-tos': '火山引擎 TOS',
}

export function ConnectionDialog(props?: ConnectionDialogProps) {
  const storeOpen = useConnectionDialogStore(state => state.open)
  const storeProvider = useConnectionDialogStore(state => state.provider)
  const storeSetOpen = useConnectionDialogStore(state => state.setOpen)

  const open = props?.open !== undefined ? props.open : storeOpen
  const editProfile = props?.editProfile
  const initialProvider = editProfile?.provider ?? props?.initialProvider ?? storeProvider
  const onOpenChange = props?.onOpenChange ?? storeSetOpen
  const onNotice = props?.onNotice ?? showNotice
  const onConnected = props?.onConnected

  const { connectionListError, connect, updateConnection } = useStorageConnection()
  const [name, setName] = useState(editProfile?.name ?? '')
  const [provider, setProvider] = useState<StorageProvider>(initialProvider)
  const [accountId, setAccountId] = useState<string | null>(editProfile?.accountId ?? null)
  const [region, setRegion] = useState(editProfile?.region ?? '')
  const [endpoint, setEndpoint] = useState<string | null>(editProfile?.endpoint ?? null)
  const [accessKeyId, setAccessKeyId] = useState<string | null>(null)
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [sessionToken, setSessionToken] = useState('')
  const [bucket, setBucket] = useState<string | null>(editProfile?.bucket ?? null)
  const [busy, setBusy] = useState(false)
  const [rememberConnection, setRememberConnection] = useState(true)
  const [replaceCredentials, setReplaceCredentials] = useState(false)
  const [error, setError] = useState('')

  async function submitConnection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const connectionFields = {
        name: name.trim(),
        accountId: accountId ?? '',
        region: provider === 'cloudflare-r2' || provider === 'google-cloud-storage' ? '' : region.trim(),
        endpoint: provider === 'cloudflare-r2' ? endpoint ?? '' : '',
        bucket: bucket ?? '',
      }
      if (editProfile) {
        const publicUrlCleared = await updateConnection({
          ...connectionFields,
          connectionId: editProfile.id,
          credentials: replaceCredentials
            ? { accessKeyId: accessKeyId ?? '', secretAccessKey, sessionToken: provider === 'aws-s3' ? sessionToken.trim() : '' }
            : undefined,
        })
        onNotice(publicUrlCleared ? '连接已更新；目标发生变化，原公开域名配置已清除。' : '连接设置已更新并重新连接。')
      }
      else {
        await connect({
          ...connectionFields,
          provider,
          accessKeyId: accessKeyId ?? '',
          secretAccessKey,
          sessionToken: provider === 'aws-s3' ? sessionToken.trim() : '',
          rememberConnection,
        })
        onNotice('连接已添加并设为当前连接。')
      }
      setSecretAccessKey('')
      setSessionToken('')
      setAccessKeyId(null)
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
            {editProfile ? '编辑存储连接' : '添加存储连接'}
          </DialogTitle>
          <DialogDescription>
            {editProfile
              ? '修改连接配置并验证 Bucket。保留旧凭证时无需重新输入密钥。'
              : '选择服务商并填写 Bucket 与凭证。勾选保存后，连接元数据与凭证会保存在本机。'}
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
              {editProfile
                ? <Badge variant="outline">{providerLabels[provider]}</Badge>
                : (
                    <ToggleGroup
                      className="flex-wrap"
                      variant="outline"
                      value={[provider]}
                      onValueChange={(value) => {
                        if (value[0] === 'cloudflare-r2' || value[0] === 'aws-s3' || value[0] === 'tencent-cos' || value[0] === 'aliyun-oss' || value[0] === 'google-cloud-storage' || value[0] === 'qiniu-kodo' || value[0] === 'volcengine-tos')
                          setProvider(value[0])
                      }}
                      aria-label="存储服务商"
                    >
                      <ToggleGroupItem value="cloudflare-r2">Cloudflare R2</ToggleGroupItem>
                      <ToggleGroupItem value="aws-s3">AWS S3</ToggleGroupItem>
                      <ToggleGroupItem value="tencent-cos">腾讯云 COS</ToggleGroupItem>
                      <ToggleGroupItem value="aliyun-oss">阿里云 OSS</ToggleGroupItem>
                      <ToggleGroupItem value="google-cloud-storage">Google Cloud Storage</ToggleGroupItem>
                      <ToggleGroupItem value="qiniu-kodo">七牛云 Kodo</ToggleGroupItem>
                      <ToggleGroupItem value="volcengine-tos">火山引擎 TOS</ToggleGroupItem>
                    </ToggleGroup>
                  )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-name">连接名称</Label>
              <Input
                id="r2-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="例如：生产环境"
                maxLength={100}
                required={Boolean(editProfile)}
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
            {provider !== 'cloudflare-r2' && provider !== 'google-cloud-storage' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="storage-region">地域 Region</Label>
                <Input id="storage-region" value={region} onChange={event => setRegion(event.target.value)} placeholder={provider === 'aws-s3' ? '例如 us-east-1' : provider === 'aliyun-oss' ? '例如 cn-hangzhou' : provider === 'qiniu-kodo' ? '例如 cn-east-1' : provider === 'volcengine-tos' ? '例如 cn-beijing' : '例如 ap-guangzhou'} pattern="[a-z0-9-]+" required />
                {provider === 'volcengine-tos' && <p className="text-xs text-muted-foreground">例如 TOS Endpoint 为 tos-ap-southeast-3.volces.com 时，Region ID 为 ap-southeast-3。</p>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-bucket">{provider === 'qiniu-kodo' ? 'S3 空间名' : 'Bucket 名称'}</Label>
              <Input
                id="r2-bucket"
                autoComplete="off"
                value={bucket ?? ''}
                onChange={event => setBucket(event.target.value)}
                placeholder={provider === 'tencent-cos' ? 'examplebucket-1250000000' : 'my-bucket'}
                required
              />
              {provider === 'tencent-cos' && <p className="text-xs text-muted-foreground">填写包含 APPID 的完整 Bucket 名称。</p>}
              {provider === 'qiniu-kodo' && <p className="text-xs text-muted-foreground">请从七牛空间概览复制 S3 空间名；它可能不同于原空间名称。</p>}
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
            {editProfile && (
              <div className="flex items-center gap-2">
                <Checkbox id="replace-connection-credentials" checked={replaceCredentials} onCheckedChange={checked => setReplaceCredentials(checked === true)} />
                <Label htmlFor="replace-connection-credentials">更新访问密钥</Label>
              </div>
            )}
            {(!editProfile || replaceCredentials) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="r2-access-key">{provider === 'tencent-cos' ? 'SecretId' : provider === 'google-cloud-storage' ? 'HMAC Access ID' : provider === 'qiniu-kodo' ? 'AccessKey' : 'Access Key ID'}</Label>
                <Input
                  id="r2-access-key"
                  autoComplete="off"
                  value={accessKeyId ?? ''}
                  onChange={event => setAccessKeyId(event.target.value)}
                  placeholder={provider === 'tencent-cos' ? '腾讯云 API 密钥的 SecretId' : provider === 'aliyun-oss' ? '阿里云 AccessKey ID' : provider === 'google-cloud-storage' ? 'Google Cloud Storage HMAC Access ID' : provider === 'qiniu-kodo' ? '七牛云 AccessKey' : provider === 'volcengine-tos' ? '火山引擎 Access Key ID' : provider === 'aws-s3' ? 'AWS Access Key ID' : 'R2 API Token 的 Access Key ID'}
                  required
                />
              </div>
            )}
            {(!editProfile || replaceCredentials) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="r2-secret-key">{provider === 'tencent-cos' || provider === 'qiniu-kodo' ? 'SecretKey' : provider === 'aliyun-oss' ? 'AccessKey Secret' : provider === 'google-cloud-storage' ? 'HMAC Secret' : 'Secret Access Key'}</Label>
                <Input
                  id="r2-secret-key"
                  type="password"
                  autoComplete="new-password"
                  value={secretAccessKey}
                  onChange={event => setSecretAccessKey(event.target.value)}
                  placeholder={provider === 'tencent-cos' ? '腾讯云 API 密钥的 SecretKey' : provider === 'aliyun-oss' ? '阿里云 AccessKey Secret' : provider === 'google-cloud-storage' ? 'Google Cloud Storage HMAC Secret' : provider === 'qiniu-kodo' ? '七牛云 SecretKey' : provider === 'volcengine-tos' ? '火山引擎 Secret Access Key' : '输入 Secret Access Key'}
                  required
                />
              </div>
            )}
            {provider === 'aws-s3' && (!editProfile || replaceCredentials) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="aws-session-token">Session Token（临时凭证需要）</Label>
                <Input
                  id="aws-session-token"
                  type="password"
                  autoComplete="off"
                  value={sessionToken}
                  onChange={event => setSessionToken(event.target.value)}
                  placeholder="长期访问密钥可留空"
                />
              </div>
            )}
            {!editProfile && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="r2-remember-connection"
                  checked={rememberConnection}
                  onCheckedChange={checked => setRememberConnection(checked === true)}
                />
                <Label htmlFor="r2-remember-connection">保存连接信息，供下次使用</Label>
              </div>
            )}
          </form>
          {!editProfile && <Separator />}
          {!editProfile && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {provider === 'tencent-cos'
                ? '请使用有该 Bucket 对象权限的腾讯云子用户密钥。Endpoint 会根据地域自动生成。'
                : provider === 'aliyun-oss'
                  ? '请使用有该 Bucket 对象权限的阿里云 RAM 用户 AccessKey。Endpoint 会根据地域自动生成。'
                  : provider === 'aws-s3'
                    ? '请使用有目标 Bucket 列表和对象操作权限的 AWS 凭证。临时凭证需同时填写 Session Token；端点由 AWS SDK 根据地域选择。'
                    : provider === 'google-cloud-storage'
                      ? '请在 Google Cloud Storage 的互操作性设置中创建有该 Bucket 权限的 HMAC 密钥。这里不使用服务账号 JSON 密钥；Endpoint 固定为 storage.googleapis.com。'
                      : provider === 'qiniu-kodo'
                        ? '请填写空间概览中的 S3 空间名和 Region ID，并使用有该空间权限的七牛 AccessKey/SecretKey。S3 Endpoint 会自动生成；公开链接需另配空间绑定域名。'
                        : provider === 'volcengine-tos'
                          ? '请填写 Bucket 的 Region ID，并使用有该 Bucket 权限的火山引擎 Access Key。TOS S3 Endpoint 会自动生成。'
                          : '请在 Cloudflare R2 创建对象读权限或读写权限的 S3 API Token，并尽量限制到这个 Bucket。'}
              {' '}
              密钥不会写入普通配置文件；勾选后只存到本机系统凭证库，连接成功后会清空表单中的密钥。
            </p>
          )}
          {editProfile && <p className="text-xs text-muted-foreground">保存前会验证新配置；验证失败不会替换原连接。更新密钥时需填写完整的新访问密钥，AWS Session Token 留空会将其清除。</p>}
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" form="storage-connection-form" disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : <CloudArrowUpIcon data-icon="inline-start" />}
            {busy ? '正在连接并读取对象…' : editProfile ? '保存并连接' : '添加并连接'}
            {!busy && <ArrowRightIcon data-icon="inline-end" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
