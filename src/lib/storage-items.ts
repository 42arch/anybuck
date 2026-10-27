import type { StorageItem, StorageObject } from '@/types/storage'
import i18n from '@/i18n'
import { fileKindFromName } from '@/lib/file-kind'
import { formatBytes } from '@/lib/format-bytes'

export function toStorageItems(objects: StorageObject[], locale: string): StorageItem[] {
  const dateTimeFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return objects.map((object) => {
    const kind = object.kind === 'directory' ? 'folder' : fileKindFromName(object.name)
    return {
      id: object.key,
      name: object.name,
      kind,
      size: object.kind === 'directory' ? '—' : formatBytes(object.size ?? 0),
      ...(object.kind === 'file' && object.size !== null ? { sizeBytes: object.size } : {}),
      updated: object.lastModified ? dateTimeFormatter.format(new Date(object.lastModified)) : '—',
      detail: object.kind === 'directory' ? i18n.t('dynamic.virtualDirectory') : i18n.t('dynamic.storageObject'),
      ...(object.kind === 'directory' ? { path: object.key.replace(/\/+$/, '') } : {}),
    }
  })
}
