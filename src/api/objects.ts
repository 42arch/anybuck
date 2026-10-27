import type { DeleteObjectsResult, StorageObjectPage } from '@/types/storage'
import { invokeCommand } from '@/api/invoke'

export function listObjects(connectionId: string, prefix: string, continuationToken?: string | null, search?: string) {
  return invokeCommand<StorageObjectPage>('list_objects', {
    connectionId,
    prefix,
    continuationToken: continuationToken ?? null,
    search: search ?? null,
  })
}

export function countObjects(connectionId: string, prefix: string, search?: string) {
  return invokeCommand<number>('count_objects', { connectionId, prefix, search: search ?? null })
}

export function previewImage(connectionId: string, key: string) {
  return invokeCommand<ArrayBuffer>('preview_image', { connectionId, key })
}

export function previewText(connectionId: string, key: string) {
  return invokeCommand<ArrayBuffer>('preview_text', { connectionId, key })
}

export function deleteObjects(connectionId: string, keys: string[]) {
  return invokeCommand<DeleteObjectsResult>('delete_objects', { connectionId, keys })
}

export function createFolder(connectionId: string, prefix: string, name: string) {
  return invokeCommand<void>('create_folder', { connectionId, prefix, name })
}
