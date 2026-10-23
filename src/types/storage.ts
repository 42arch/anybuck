export type FileKind = 'folder' | 'image' | 'document' | 'archive' | 'file'

export interface StorageObject {
  key: string
  name: string
  kind: 'directory' | 'file'
  size: number | null
  lastModified: string | null
  etag: string | null
}

export interface StorageObjectPage {
  objects: StorageObject[]
  nextToken: string | null
}

export interface DeleteObjectsResult {
  deletedCount: number
  failedKeys: string[]
}

export interface StorageItem {
  id: string
  name: string
  kind: FileKind
  size: string
  sizeBytes?: number
  updated: string
  detail: string
  path?: string
}

export interface StorageBucket {
  id: string
  name: string
  region: string
  count: string
  size: string
}
