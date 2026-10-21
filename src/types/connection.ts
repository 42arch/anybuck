import type { R2ObjectPage } from '@/types/storage'

export type StorageProvider = 'cloudflare-r2' | 'tencent-cos'

export interface ConnectR2Request {
  connectionId?: string
  provider: StorageProvider
  name: string
  accountId: string
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  rememberConnection: boolean
}

export interface SavedR2Connection {
  id: string
  name: string
  provider: StorageProvider
  region: string
  accountId: string
  endpoint: string
  bucket: string
}

export interface R2ConnectionResult extends R2ObjectPage {
  connectionId: string
  provider: StorageProvider
  name: string
  bucket: string
  endpoint: string
}

export type ActiveR2Connection = Pick<R2ConnectionResult, 'connectionId' | 'provider' | 'bucket' | 'endpoint' | 'name'>

export interface R2ConnectionEntry extends ActiveR2Connection {
  connected: boolean
}
