import type { ComponentType } from 'react'
import type { ProviderDraft } from './provider-form-model'
import type { StorageProvider } from '@/types/connection'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import i18n from '@/i18n'

interface ProviderFieldsProps {
  draft: ProviderDraft
  onChange: (field: keyof ProviderDraft, value: string) => void
  showCredentials: boolean
  editing: boolean
}

function RegionField({ draft, onChange, placeholder, hint }: ProviderFieldsProps & { placeholder: string, hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="storage-region">{i18n.t('connectionDialog.region')}</Label>
      <Input id="storage-region" value={draft.region} onChange={event => onChange('region', event.target.value)} placeholder={placeholder} pattern="[a-z0-9-]+" required />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function BucketField({ draft, onChange, qiniu = false, cos = false }: ProviderFieldsProps & { qiniu?: boolean, cos?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="storage-bucket">{i18n.t(qiniu ? 'connectionDialog.s3BucketName' : 'connectionDialog.bucketName')}</Label>
      <Input id="storage-bucket" autoComplete="off" value={draft.bucket} onChange={event => onChange('bucket', event.target.value)} placeholder={cos ? 'examplebucket-1250000000' : 'my-bucket'} required />
      {cos && <p className="text-xs text-muted-foreground">{i18n.t('connectionDialog.cosBucketHint')}</p>}
      {qiniu && <p className="text-xs text-muted-foreground">{i18n.t('connectionDialog.qiniuBucketHint')}</p>}
    </div>
  )
}

interface CredentialsProps extends ProviderFieldsProps {
  accessLabel: string
  accessPlaceholder: string
  secretLabel: string
  secretPlaceholder: string
}

function CredentialsFields({ draft, onChange, showCredentials, accessLabel, accessPlaceholder, secretLabel, secretPlaceholder }: CredentialsProps) {
  if (!showCredentials)
    return null

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="storage-access-key">{accessLabel}</Label>
        <Input id="storage-access-key" autoComplete="off" value={draft.accessKeyId} onChange={event => onChange('accessKeyId', event.target.value)} placeholder={accessPlaceholder} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="storage-secret-key">{secretLabel}</Label>
        <Input id="storage-secret-key" type="password" autoComplete="new-password" value={draft.secretAccessKey} onChange={event => onChange('secretAccessKey', event.target.value)} placeholder={secretPlaceholder} required />
      </div>
    </>
  )
}

function R2Fields(props: ProviderFieldsProps) {
  const { draft, onChange } = props
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="r2-account-id">{i18n.t('connectionDialog.cloudflareAccountId')}</Label>
        <Input id="r2-account-id" autoComplete="off" value={draft.accountId} onChange={event => onChange('accountId', event.target.value)} placeholder={i18n.t('connectionDialog.accountIdPlaceholder')} minLength={32} maxLength={32} pattern="[0-9a-fA-F]{32}" required />
      </div>
      <BucketField {...props} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="r2-endpoint">S3 API Endpoint</Label>
        <Input id="r2-endpoint" autoComplete="url" value={draft.endpoint} onChange={event => onChange('endpoint', event.target.value)} placeholder={draft.accountId ? `https://${draft.accountId}.r2.cloudflarestorage.com` : i18n.t('connectionDialog.leaveBlankGenerateAccountId')} />
        <p className="text-xs text-muted-foreground">{i18n.t('connectionDialog.r2SpecialEndpointHint')}</p>
      </div>
      <CredentialsFields {...props} accessLabel="Access Key ID" accessPlaceholder={i18n.t('connectionDialog.r2AccessKeyIdPlaceholder')} secretLabel="Secret Access Key" secretPlaceholder={i18n.t('connectionDialog.enterSecretAccessKey')} />
    </>
  )
}

function AwsFields(props: ProviderFieldsProps) {
  return (
    <>
      <RegionField {...props} placeholder={i18n.t('connectionDialog.exampleUsEast1')} />
      <BucketField {...props} />
      <CredentialsFields {...props} accessLabel="Access Key ID" accessPlaceholder="AWS Access Key ID" secretLabel="Secret Access Key" secretPlaceholder={i18n.t('connectionDialog.enterSecretAccessKey')} />
      {props.showCredentials && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="aws-session-token">{i18n.t('connectionDialog.sessionTokenRequiredTemporaryCredentials')}</Label>
          <Input id="aws-session-token" type="password" autoComplete="off" value={props.draft.sessionToken} onChange={event => props.onChange('sessionToken', event.target.value)} placeholder={i18n.t('connectionDialog.leaveBlankLongTermAccess')} />
          {props.editing && <p className="text-xs text-muted-foreground">{i18n.t('connectionDialog.clearSessionTokenHint')}</p>}
        </div>
      )}
    </>
  )
}

function CosFields(props: ProviderFieldsProps) {
  return (
    <>
      <RegionField {...props} placeholder={i18n.t('connectionDialog.exampleApGuangzhou')} />
      <BucketField {...props} cos />
      <CredentialsFields {...props} accessLabel="SecretId" accessPlaceholder={i18n.t('connectionDialog.tencentSecretIdPlaceholder')} secretLabel="SecretKey" secretPlaceholder={i18n.t('connectionDialog.tencentSecretKeyPlaceholder')} />
    </>
  )
}

function OssFields(props: ProviderFieldsProps) {
  return (
    <>
      <RegionField {...props} placeholder={i18n.t('connectionDialog.exampleCnHangzhou')} />
      <BucketField {...props} />
      <CredentialsFields {...props} accessLabel="Access Key ID" accessPlaceholder={i18n.t('connectionDialog.aliyunAccessKeyIdPlaceholder')} secretLabel="AccessKey Secret" secretPlaceholder={i18n.t('connectionDialog.aliyunAccessKeySecretPlaceholder')} />
    </>
  )
}

function GcsFields(props: ProviderFieldsProps) {
  return (
    <>
      <BucketField {...props} />
      <CredentialsFields {...props} accessLabel="HMAC Access ID" accessPlaceholder="Google Cloud Storage HMAC Access ID" secretLabel="HMAC Secret" secretPlaceholder="Google Cloud Storage HMAC Secret" />
    </>
  )
}

function KodoFields(props: ProviderFieldsProps) {
  return (
    <>
      <RegionField {...props} placeholder={i18n.t('connectionDialog.exampleCnEast1')} />
      <BucketField {...props} qiniu />
      <CredentialsFields {...props} accessLabel="AccessKey" accessPlaceholder={i18n.t('connectionDialog.qiniuAccessKeyPlaceholder')} secretLabel="SecretKey" secretPlaceholder={i18n.t('connectionDialog.qiniuSecretKeyPlaceholder')} />
    </>
  )
}

function TosFields(props: ProviderFieldsProps) {
  return (
    <>
      <RegionField {...props} placeholder={i18n.t('connectionDialog.exampleCnBeijing')} hint={i18n.t('connectionDialog.tosRegionHint')} />
      <BucketField {...props} />
      <CredentialsFields {...props} accessLabel="Access Key ID" accessPlaceholder={i18n.t('connectionDialog.volcengineAccessKeyId')} secretLabel="Secret Access Key" secretPlaceholder={i18n.t('connectionDialog.volcengineSecretAccessKey')} />
    </>
  )
}

const providerFields: Record<StorageProvider, ComponentType<ProviderFieldsProps>> = {
  'cloudflare-r2': R2Fields,
  'aws-s3': AwsFields,
  'tencent-cos': CosFields,
  'aliyun-oss': OssFields,
  'google-cloud-storage': GcsFields,
  'qiniu-kodo': KodoFields,
  'volcengine-tos': TosFields,
}

const providerHintKeys: Record<StorageProvider, string> = {
  'cloudflare-r2': 'connectionDialog.r2TokenHint',
  'aws-s3': 'connectionDialog.awsCredentialsHint',
  'tencent-cos': 'connectionDialog.tencentCredentialsHint',
  'aliyun-oss': 'connectionDialog.aliyunCredentialsHint',
  'google-cloud-storage': 'connectionDialog.gcsCredentialsHint',
  'qiniu-kodo': 'connectionDialog.qiniuCredentialsHint',
  'volcengine-tos': 'connectionDialog.tosCredentialsHint',
}

export function ProviderFormFields({ provider, ...props }: ProviderFieldsProps & { provider: StorageProvider }) {
  const Fields = providerFields[provider]
  return <Fields {...props} />
}

export function ProviderCredentialsHint({ provider }: { provider: StorageProvider }) {
  return <p>{i18n.t(providerHintKeys[provider])}</p>
}
