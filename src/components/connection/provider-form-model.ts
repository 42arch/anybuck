import type { StorageProvider } from '@/types/connection'

export interface ProviderDraft {
  accountId: string
  region: string
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}

export function connectionFieldsForProvider(provider: StorageProvider, draft: ProviderDraft) {
  return {
    accountId: provider === 'cloudflare-r2' ? draft.accountId.trim() : '',
    region: provider === 'cloudflare-r2' || provider === 'google-cloud-storage' ? '' : draft.region.trim(),
    endpoint: provider === 'cloudflare-r2' ? draft.endpoint.trim() : '',
    bucket: draft.bucket.trim(),
    sessionToken: provider === 'aws-s3' ? draft.sessionToken.trim() : '',
  }
}
