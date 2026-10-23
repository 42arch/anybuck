import type { StorageObjectPage } from '@/types/storage'

export type StorageProvider = 'cloudflare-r2' | 'aws-s3' | 'tencent-cos' | 'aliyun-oss'

export interface ConnectStorageRequest {
  connectionId?: string
  provider: StorageProvider
  name: string
  accountId: string
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  bucket: string
  rememberConnection: boolean
}

export interface SavedStorageConnection {
  id: string
  name: string
  provider: StorageProvider
  region: string
  accountId: string
  endpoint: string
  bucket: string
}

export interface StorageConnectionResult extends StorageObjectPage {
  connectionId: string
  provider: StorageProvider
  name: string
  bucket: string
  endpoint: string
}

export type ActiveStorageConnection = Pick<StorageConnectionResult, 'connectionId' | 'provider' | 'bucket' | 'endpoint' | 'name'>

export interface StorageConnectionEntry extends ActiveStorageConnection {
  connected: boolean
}
