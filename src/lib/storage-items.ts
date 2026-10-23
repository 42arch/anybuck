import type { StorageItem, StorageObject } from '@/types/storage'
import { fileKindFromName } from '@/lib/file-kind'
import { formatBytes } from '@/lib/format-bytes'

export function toStorageItems(objects: StorageObject[]): StorageItem[] {
  return objects.map((object) => {
    const kind = object.kind === 'directory' ? 'folder' : fileKindFromName(object.name)
    return {
      id: object.key,
      name: object.name,
      kind,
      size: object.kind === 'directory' ? '—' : formatBytes(object.size ?? 0),
      ...(object.kind === 'file' && object.size !== null ? { sizeBytes: object.size } : {}),
      updated: object.lastModified ? new Date(object.lastModified).toLocaleString() : '—',
      detail: object.kind === 'directory' ? '虚拟目录' : '存储对象',
      ...(object.kind === 'directory' ? { path: object.key.replace(/\/+$/, '') } : {}),
    }
  })
}
