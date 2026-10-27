import type { SavedStorageConnection, StorageProvider } from '@/types/connection'
import { ArrowRightIcon, CaretDownIcon, CloudArrowUpIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useStorageConnection } from '@/hooks/use-storage-connection'
import i18n from '@/i18n'

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

const providerLabelKeys: Record<StorageProvider, string> = {
  'cloudflare-r2': 'providers.cloudflareR2',
  'aws-s3': 'providers.awsS3',
  'tencent-cos': 'providers.tencentCloudCos',
  'aliyun-oss': 'providers.alibabaCloudOss',
  'google-cloud-storage': 'providers.googleCloudStorage',
  'qiniu-kodo': 'providers.qiniuKodo',
  'volcengine-tos': 'providers.volcengineTos',
}

function providerLabel(provider: StorageProvider): string {
  return i18n.t(providerLabelKeys[provider])
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
        onNotice(publicUrlCleared ? i18n.t('connectionDialog.destinationChangedNotice') : i18n.t('connectionDialog.connectionSettingsUpdatedReconnected'))
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
        onNotice(i18n.t('connectionDialog.connectionAddedSelected'))
      }
      setSecretAccessKey('')
      setSessionToken('')
      setAccessKeyId(null)
      onConnected?.()
      onOpenChange(false)
    }
    catch (cause) {
      setError(errorMessage(cause))
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
            {editProfile ? i18n.t('connectionDialog.editStorageConnection') : i18n.t('connectionDialog.addStorageConnection')}
          </DialogTitle>
          <DialogDescription>
            {editProfile
              ? i18n.t('connectionDialog.editDescription')
              : i18n.t('connectionDialog.addDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {connectionListError && (
            <Alert variant="destructive">
              <AlertTitle>{i18n.t('connections.loadSavedFailed')}</AlertTitle>
              <AlertDescription>{i18n.t('dynamic.connectionListError', { message: connectionListError })}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{i18n.t('connectionDialog.connectionFailed')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form id="storage-connection-form" className="grid grid-cols-1 gap-4" onSubmit={submitConnection}>
            <div className="flex flex-col gap-2">
              <Label>{i18n.t('connectionDialog.provider')}</Label>
              {editProfile
                ? <Badge variant="outline">{providerLabel(provider)}</Badge>
                : (
                    <ToggleGroup
                      className="flex-wrap"
                      variant="outline"
                      value={[provider]}
                      onValueChange={(value) => {
                        if (value[0] === 'cloudflare-r2' || value[0] === 'aws-s3' || value[0] === 'tencent-cos' || value[0] === 'aliyun-oss' || value[0] === 'google-cloud-storage' || value[0] === 'qiniu-kodo' || value[0] === 'volcengine-tos')
                          setProvider(value[0])
                      }}
                      aria-label={i18n.t('connectionDialog.storageProvider')}
                    >
                      <ToggleGroupItem value="cloudflare-r2">Cloudflare R2</ToggleGroupItem>
                      <ToggleGroupItem value="aws-s3">AWS S3</ToggleGroupItem>
                      <ToggleGroupItem value="tencent-cos">{i18n.t('providers.tencentCloudCos')}</ToggleGroupItem>
                      <ToggleGroupItem value="aliyun-oss">{i18n.t('providers.alibabaCloudOss')}</ToggleGroupItem>
                      <ToggleGroupItem value="google-cloud-storage">Google Cloud Storage</ToggleGroupItem>
                      <ToggleGroupItem value="qiniu-kodo">{i18n.t('providers.qiniuKodo')}</ToggleGroupItem>
                      <ToggleGroupItem value="volcengine-tos">{i18n.t('providers.volcengineTos')}</ToggleGroupItem>
                    </ToggleGroup>
                  )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-name">{i18n.t('connections.name')}</Label>
              <Input
                id="r2-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder={i18n.t('connectionDialog.exampleProduction')}
                maxLength={100}
                required={Boolean(editProfile)}
              />
            </div>
            {provider === 'cloudflare-r2' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="r2-account-id">{i18n.t('connectionDialog.cloudflareAccountId')}</Label>
                <Input
                  id="r2-account-id"
                  autoComplete="off"
                  value={accountId ?? ''}
                  onChange={event => setAccountId(event.target.value)}
                  placeholder={i18n.t('connectionDialog.accountIdPlaceholder')}
                  minLength={32}
                  maxLength={32}
                  pattern="[0-9a-fA-F]{32}"
                  required
                />
              </div>
            )}
            {provider !== 'cloudflare-r2' && provider !== 'google-cloud-storage' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="storage-region">{i18n.t('connectionDialog.region')}</Label>
                <Input id="storage-region" value={region} onChange={event => setRegion(event.target.value)} placeholder={provider === 'aws-s3' ? i18n.t('connectionDialog.exampleUsEast1') : provider === 'aliyun-oss' ? i18n.t('connectionDialog.exampleCnHangzhou') : provider === 'qiniu-kodo' ? i18n.t('connectionDialog.exampleCnEast1') : provider === 'volcengine-tos' ? i18n.t('connectionDialog.exampleCnBeijing') : i18n.t('connectionDialog.exampleApGuangzhou')} pattern="[a-z0-9-]+" required />
                {provider === 'volcengine-tos' && <p className="text-xs text-muted-foreground">{i18n.t('connectionDialog.tosRegionHint')}</p>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="r2-bucket">{provider === 'qiniu-kodo' ? i18n.t('connectionDialog.s3BucketName') : i18n.t('connectionDialog.bucketName')}</Label>
              <Input
                id="r2-bucket"
                autoComplete="off"
                value={bucket ?? ''}
                onChange={event => setBucket(event.target.value)}
                placeholder={provider === 'tencent-cos' ? 'examplebucket-1250000000' : 'my-bucket'}
                required
              />
              {provider === 'tencent-cos' && <p className="text-xs text-muted-foreground">{i18n.t('connectionDialog.cosBucketHint')}</p>}
              {provider === 'qiniu-kodo' && <p className="text-xs text-muted-foreground">{i18n.t('connectionDialog.qiniuBucketHint')}</p>}
            </div>
            {provider === 'cloudflare-r2' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="r2-endpoint">S3 API Endpoint</Label>
                <Input
                  id="r2-endpoint"
                  autoComplete="url"
                  value={endpoint ?? ''}
                  onChange={event => setEndpoint(event.target.value)}
                  placeholder={accountId ? `https://${accountId}.r2.cloudflarestorage.com` : i18n.t('connectionDialog.leaveBlankGenerateAccountId')}
                />
                <p className="text-xs text-muted-foreground">{i18n.t('connectionDialog.r2SpecialEndpointHint')}</p>
              </div>
            )}
            {editProfile && (
              <div className="flex items-center gap-2">
                <Checkbox id="replace-connection-credentials" checked={replaceCredentials} onCheckedChange={checked => setReplaceCredentials(checked === true)} />
                <Label htmlFor="replace-connection-credentials">{i18n.t('connectionDialog.updateAccessKeys')}</Label>
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
                  placeholder={provider === 'tencent-cos' ? i18n.t('connectionDialog.tencentSecretIdPlaceholder') : provider === 'aliyun-oss' ? i18n.t('connectionDialog.aliyunAccessKeyIdPlaceholder') : provider === 'google-cloud-storage' ? 'Google Cloud Storage HMAC Access ID' : provider === 'qiniu-kodo' ? i18n.t('connectionDialog.qiniuAccessKeyPlaceholder') : provider === 'volcengine-tos' ? i18n.t('connectionDialog.volcengineAccessKeyId') : provider === 'aws-s3' ? 'AWS Access Key ID' : i18n.t('connectionDialog.r2AccessKeyIdPlaceholder')}
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
                  placeholder={provider === 'tencent-cos' ? i18n.t('connectionDialog.tencentSecretKeyPlaceholder') : provider === 'aliyun-oss' ? i18n.t('connectionDialog.aliyunAccessKeySecretPlaceholder') : provider === 'google-cloud-storage' ? 'Google Cloud Storage HMAC Secret' : provider === 'qiniu-kodo' ? i18n.t('connectionDialog.qiniuSecretKeyPlaceholder') : provider === 'volcengine-tos' ? i18n.t('connectionDialog.volcengineSecretAccessKey') : i18n.t('connectionDialog.enterSecretAccessKey')}
                  required
                />
              </div>
            )}
            {provider === 'aws-s3' && (!editProfile || replaceCredentials) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="aws-session-token">{i18n.t('connectionDialog.sessionTokenRequiredTemporaryCredentials')}</Label>
                <Input
                  id="aws-session-token"
                  type="password"
                  autoComplete="off"
                  value={sessionToken}
                  onChange={event => setSessionToken(event.target.value)}
                  placeholder={i18n.t('connectionDialog.leaveBlankLongTermAccess')}
                />
                {editProfile && <p className="text-xs text-muted-foreground">{i18n.t('connectionDialog.clearSessionTokenHint')}</p>}
              </div>
            )}
            {!editProfile && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="r2-remember-connection"
                  checked={rememberConnection}
                  onCheckedChange={checked => setRememberConnection(checked === true)}
                />
                <Label htmlFor="r2-remember-connection">{i18n.t('connectionDialog.saveConnectionLaterUse')}</Label>
              </div>
            )}
          </form>
          <Separator />
          <Collapsible>
            <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
              {i18n.t('connectionDialog.configurationDetails')}
              <CaretDownIcon data-icon="inline-end" />
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-2 pt-2 text-xs leading-relaxed text-muted-foreground">
              {editProfile
                ? <p>{i18n.t('connectionDialog.editValidationHint')}</p>
                : (
                    <>
                      <p>
                        {provider === 'tencent-cos'
                          ? i18n.t('connectionDialog.tencentCredentialsHint')
                          : provider === 'aliyun-oss'
                            ? i18n.t('connectionDialog.aliyunCredentialsHint')
                            : provider === 'aws-s3'
                              ? i18n.t('connectionDialog.awsCredentialsHint')
                              : provider === 'google-cloud-storage'
                                ? i18n.t('connectionDialog.gcsCredentialsHint')
                                : provider === 'qiniu-kodo'
                                  ? i18n.t('connectionDialog.qiniuCredentialsHint')
                                  : provider === 'volcengine-tos'
                                    ? i18n.t('connectionDialog.tosCredentialsHint')
                                    : i18n.t('connectionDialog.r2TokenHint')}
                      </p>
                      <p>{i18n.t('connectionDialog.credentialStorageHint')}</p>
                    </>
                  )}
            </CollapsibleContent>
          </Collapsible>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {i18n.t('common.cancel')}
          </Button>
          <Button type="submit" form="storage-connection-form" disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : <CloudArrowUpIcon data-icon="inline-start" />}
            {busy ? i18n.t('connectionDialog.connectingListingObjects') : editProfile ? i18n.t('connectionDialog.saveConnect') : i18n.t('connectionDialog.addConnect')}
            {!busy && <ArrowRightIcon data-icon="inline-end" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
