import type { SavedStorageConnection, StorageProvider } from '@/types/connection'
import { CloudIcon, InfoIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { ConnectionDialog } from '@/components/connection/connection-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStorageConnection } from '@/hooks/use-storage-connection'
import i18n from '@/i18n'
import { showNotice } from '@/lib/notice'
import { normalizePublicBaseUrl } from '@/lib/object-url'
import { useSettingsStore } from '@/store/settings-store'
import { ConnectionCompatibilityCheck } from './connection-compatibility-check'

interface ConnectionsSettingsProps {
  onNotice?: (message: string) => void
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

function publicDomainPlaceholder(provider: StorageProvider): string {
  if (provider === 'cloudflare-r2')
    return i18n.t('connectionsSettings.r2PublicDomainPlaceholder')
  if (provider === 'qiniu-kodo')
    return i18n.t('connectionsSettings.qiniuPublicDomainPlaceholder')
  return i18n.t('dynamic.providerDefaultAddress', { provider: providerLabel(provider) })
}

function publicDomainDescription(provider: StorageProvider): string {
  if (provider === 'cloudflare-r2')
    return i18n.t('connectionsSettings.r2PublicDomainHint')
  if (provider === 'qiniu-kodo')
    return i18n.t('connectionsSettings.qiniuPublicDomainHint')
  return i18n.t('dynamic.providerCustomDomain', { provider: providerLabel(provider) })
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
  const [editingProfile, setEditingProfile] = useState<SavedStorageConnection | null>(null)
  const [probeRevision, setProbeRevision] = useState(0)
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
      setError(errorMessage(cause))
    }
    finally {
      setBusyConnectionId(null)
    }
  }

  function savePublicBaseUrl(connectionId: string) {
    const draft = (publicUrlDrafts[connectionId] ?? publicBaseUrls[connectionId] ?? '').trim()
    const normalized = draft ? normalizePublicBaseUrl(draft) : ''
    if (normalized === null) {
      setError(i18n.t('connectionsSettings.invalidPublicDomain'))
      return
    }
    setPublicBaseUrl(connectionId, normalized)
    setPublicUrlDrafts(current => ({ ...current, [connectionId]: normalized }))
    setError('')
    onNotice(normalized ? i18n.t('connectionsSettings.publicDomainSaved') : i18n.t('connectionsSettings.publicDomainCleared'))
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 pb-3">
        <h2 className="text-sm font-medium">{i18n.t('settings.connections')}</h2>
      </div>

      {connectionListError && (
        <Alert variant="destructive">
          <AlertTitle>{i18n.t('connections.loadSavedFailed')}</AlertTitle>
          <AlertDescription>
            {connectionListError}
            {' '}
            {i18n.t('connectionsSettings.checkSystemCredentialVaultAdd')}
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{i18n.t('connectionsSettings.connectionOperationFailed')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isRestoring && connections.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Spinner />
          {i18n.t('connectionsSettings.loadingConnections')}
        </div>
      )}
      {!isRestoring && connections.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <CloudIcon className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{i18n.t('connectionsSettings.noStorageConnectionsYet')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{i18n.t('connectionsSettings.addedStorageConnectionsAppearDetails')}</p>
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
                        {item.connected ? (isCurrent ? i18n.t('connectionsSettings.currentConnection') : i18n.t('nav.connected')) : i18n.t('nav.disconnected')}
                      </Badge>
                      {!isSaved && <Badge variant="outline">{i18n.t('connectionsSettings.sessionOnly')}</Badge>}
                      <Badge variant="outline">{providerLabel(item.provider)}</Badge>
                    </div>
                    {isSaved && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => setEditingProfile(savedConnections.find(profile => profile.id === item.connectionId) ?? null)}
                        >
                          <PencilSimpleIcon data-icon="inline-start" />
                          {i18n.t('common.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-destructive hover:text-destructive"
                          disabled={isBusy}
                          onClick={() => void runConnectionAction(item.connectionId, async () => {
                            await forgetSavedConnection(item.connectionId)
                            setPublicBaseUrl(item.connectionId, '')
                          }, i18n.t('dynamic.connectionDeleted', { name: item.name }))}
                        >
                          {isBusy ? <Spinner data-icon="inline-start" /> : <TrashIcon data-icon="inline-start" />}
                          {i18n.t('common.delete')}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid min-w-0 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <p className="break-all">
                      {i18n.t('connectionsSettings.bucketLabel')}
                      {item.bucket}
                    </p>
                    <p className="break-all font-mono">
                      {i18n.t('connectionsSettings.connectionId')}
                      {item.connectionId}
                    </p>
                    <p className="break-all sm:col-span-2">
                      {i18n.t('connectionsSettings.endpointLabel')}
                      {item.endpoint}
                    </p>
                  </div>
                  <form
                    className="flex min-w-0 flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      savePublicBaseUrl(item.connectionId)
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <label htmlFor={`public-domain-${item.connectionId}`} className="text-xs font-medium">{i18n.t('connectionsSettings.publicAccessDomain')}</label>
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          className="inline-flex items-center justify-center rounded-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label={i18n.t('connectionsSettings.publicDomainInformation')}
                        >
                          <InfoIcon className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs leading-relaxed">
                          {publicDomainDescription(item.provider)}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                      <Input
                        id={`public-domain-${item.connectionId}`}
                        type="url"
                        className="min-w-0"
                        value={publicUrlDrafts[item.connectionId] ?? publicBaseUrls[item.connectionId] ?? ''}
                        onChange={event => setPublicUrlDrafts(current => ({ ...current, [item.connectionId]: event.target.value }))}
                        placeholder={publicDomainPlaceholder(item.provider)}
                      />
                      <Button type="submit" variant="outline" className="shrink-0">{i18n.t('common.save')}</Button>
                    </div>
                  </form>
                  <ConnectionCompatibilityCheck key={`${item.connectionId}-${probeRevision}`} connectionId={item.connectionId} connected={item.connected} />
                </CardContent>
              </Card>
            )
          })}
          <p className="text-xs text-muted-foreground">{i18n.t('connectionsSettings.savedCredentialsHint')}</p>
        </div>
      )}
      {editingProfile && (
        <ConnectionDialog
          key={editingProfile.id}
          open
          editProfile={editingProfile}
          onOpenChange={open => !open && setEditingProfile(null)}
          onNotice={onNotice}
          onConnected={() => {
            setProbeRevision(current => current + 1)
            setPublicUrlDrafts((current) => {
              const next = { ...current }
              delete next[editingProfile.id]
              return next
            })
          }}
        />
      )}
    </section>
  )
}
