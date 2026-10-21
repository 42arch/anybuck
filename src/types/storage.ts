export type FileKind = 'folder' | 'image' | 'document' | 'archive' | 'file'

export interface R2Object {
  key: string
  name: string
  kind: 'directory' | 'file'
  size: number | null
  lastModified: string | null
  etag: string | null
}

export interface R2ObjectPage {
  objects: R2Object[]
  nextToken: string | null
}

export interface DeleteR2ObjectsResult {
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
