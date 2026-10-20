export type FileKind = 'folder' | 'image' | 'document' | 'archive' | 'file'

export interface StorageItem {
  id: string
  name: string
  kind: FileKind
  size: string
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
