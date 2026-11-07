import type { ProviderDraft } from '@/components/connection/provider-form-model'
import type { SavedStorageConnection, StorageProvider } from '@/types/connection'
import { ArrowLeftIcon, ArrowRightIcon, CaretDownIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { ProviderCredentialsHint, ProviderFormFields } from '@/components/connection/provider-form-fields'
import { connectionFieldsForProvider } from '@/components/connection/provider-form-model'
import { ProviderLogo } from '@/components/providers/provider-logo'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { useStorageConnection } from '@/hooks/use-storage-connection'
import i18n from '@/i18n'

import { showNotice } from '@/lib/notice'
import { useConnectionDialogStore } from '@/store/connection-dialog-store'

interface ConnectionDialogProps {
  open?: boolean
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

const providers = Object.keys(providerLabelKeys) as StorageProvider[]

function providerLabel(provider: StorageProvider): string {
  return i18n.t(providerLabelKeys[provider])
}

export function ConnectionDialog(props?: ConnectionDialogProps) {
  const storeOpen = useConnectionDialogStore(state => state.open)
  const storeSetOpen = useConnectionDialogStore(state => state.setOpen)

  const open = props?.open !== undefined ? props.open : storeOpen
  const editProfile = props?.editProfile
  const onOpenChange = props?.onOpenChange ?? storeSetOpen
  const onNotice = props?.onNotice ?? showNotice
  const onConnected = props?.onConnected

  const { connectionListError, connect, updateConnection } = useStorageConnection()
  const [name, setName] = useState(editProfile?.name ?? '')
  const [provider, setProvider] = useState<StorageProvider>(editProfile?.provider ?? 'cloudflare-r2')
  const [step, setStep] = useState<'select' | 'form'>(editProfile ? 'form' : 'select')
  const [draft, setDraft] = useState<ProviderDraft>({
    accountId: editProfile?.accountId ?? '',
    region: editProfile?.region ?? '',
    endpoint: editProfile?.endpoint ?? '',
    bucket: editProfile?.bucket ?? '',
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: '',
  })
  const [busy, setBusy] = useState(false)
  const [rememberConnection, setRememberConnection] = useState(true)
  const [replaceCredentials, setReplaceCredentials] = useState(false)
  const [error, setError] = useState('')

  function updateDraft(field: keyof ProviderDraft, value: string) {
    setDraft(current => ({ ...current, [field]: value }))
  }

  function selectProvider(nextProvider: StorageProvider) {
    if (nextProvider !== provider) {
      setProvider(nextProvider)
      setDraft({ accountId: '', region: '', endpoint: '', bucket: '', accessKeyId: '', secretAccessKey: '', sessionToken: '' })
    }
    setStep('form')
    setError('')
  }

  async function submitConnection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { sessionToken, ...providerFields } = connectionFieldsForProvider(provider, draft)
      const connectionFields = { name: name.trim(), ...providerFields }
      if (editProfile) {
        const publicUrlCleared = await updateConnection({
          ...connectionFields,
          connectionId: editProfile.id,
          credentials: replaceCredentials
            ? { accessKeyId: draft.accessKeyId, secretAccessKey: draft.secretAccessKey, sessionToken }
            : undefined,
        })
        onNotice(publicUrlCleared ? i18n.t('connectionDialog.destinationChangedNotice') : i18n.t('connectionDialog.connectionSettingsUpdatedReconnected'))
      }
      else {
        await connect({
          ...connectionFields,
          provider,
          accessKeyId: draft.accessKeyId,
          secretAccessKey: draft.secretAccessKey,
          sessionToken,
          rememberConnection,
        })
        onNotice(i18n.t('connectionDialog.connectionAddedSelected'))
      }
      setDraft(current => ({ ...current, accessKeyId: '', secretAccessKey: '', sessionToken: '' }))
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
            {editProfile ? i18n.t('connectionDialog.editStorageConnection') : i18n.t('connectionDialog.addStorageConnection')}
          </DialogTitle>
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
          {!editProfile && step === 'select'
            ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label={i18n.t('connectionDialog.storageProvider')}>
                {providers.map(item => (
                  <Button
                    key={item}
                    type="button"
                    variant="outline"
                    className="h-16 justify-start gap-3 px-3 text-left"
                    onClick={() => selectProvider(item)}
                  >
                    <ProviderLogo provider={item} className="size-7" />
                    <span className="truncate">{providerLabel(item)}</span>
                    <ArrowRightIcon data-icon="inline-end" className="ml-auto text-muted-foreground" />
                  </Button>
                ))}
              </div>
            )
            : (
              <>
                <form id="storage-connection-form" className="grid grid-cols-1 gap-4" onSubmit={submitConnection}>
                  <div className="flex flex-col gap-2">
                    <Label>{i18n.t('connectionDialog.provider')}</Label>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="gap-1.5">
                        <ProviderLogo provider={provider} />
                        {providerLabel(provider)}
                      </Badge>
                      {!editProfile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setStep('select')
                            setError('')
                          }}
                        >
                          <ArrowLeftIcon data-icon="inline-start" />
                          {i18n.t('connectionDialog.changeProvider')}
                        </Button>
                      )}
                    </div>
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
                  {editProfile && (
                    <div className="flex items-center gap-2">
                      <Checkbox id="replace-connection-credentials" checked={replaceCredentials} onCheckedChange={checked => setReplaceCredentials(checked === true)} />
                      <Label htmlFor="replace-connection-credentials">{i18n.t('connectionDialog.updateAccessKeys')}</Label>
                    </div>
                  )}
                  <ProviderFormFields provider={provider} draft={draft} onChange={updateDraft} showCredentials={!editProfile || replaceCredentials} editing={Boolean(editProfile)} />
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
                          <ProviderCredentialsHint provider={provider} />
                          <p>{i18n.t('connectionDialog.credentialStorageHint')}</p>
                        </>
                      )}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {i18n.t('common.cancel')}
          </Button>
          {(editProfile || step === 'form') && (
            <Button type="submit" form="storage-connection-form" disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : <></>}
              {busy ? i18n.t('connectionDialog.connectingListingObjects') : editProfile ? i18n.t('connectionDialog.saveConnect') : i18n.t('connectionDialog.addConnect')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
