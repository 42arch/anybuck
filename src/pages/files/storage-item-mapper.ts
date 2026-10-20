import type { R2Object } from '@/api/storage'
import type { FileKind, StorageItem } from '@/types/storage'

export function toStorageItems(objects: R2Object[]): StorageItem[] {
  return objects.map((object) => {
    const kind = object.kind === 'directory' ? 'folder' : fileKindFromName(object.name)
    return {
      id: object.key,
      name: object.name,
      kind,
      size: object.kind === 'directory' ? '—' : formatBytes(object.size ?? 0),
      updated: object.lastModified ? new Date(object.lastModified).toLocaleString() : '—',
      detail: object.kind === 'directory' ? 'R2 虚拟目录' : 'R2 对象',
      ...(object.kind === 'directory' ? { path: object.key.replace(/\/+$/, '') } : {}),
    }
  })
}

function fileKindFromName(name: string): FileKind {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico'].includes(extension))
    return 'image'
  if (['pdf', 'txt', 'md', 'csv', 'json', 'yaml', 'yml'].includes(extension))
    return 'document'
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(extension))
    return 'archive'
  return 'file'
}

function formatBytes(bytes: number) {
  if (bytes < 1024)
    return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unit = -1
  do {
    size /= 1024
    unit += 1
  } while (size >= 1024 && unit < units.length - 1)
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`
}
