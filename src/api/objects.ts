import type { DeleteObjectsResult, StorageObjectPage } from '@/types/storage'
import { invoke } from '@tauri-apps/api/core'

export function listObjects(connectionId: string, prefix: string, continuationToken?: string | null) {
  return invoke<StorageObjectPage>('list_objects', {
    connectionId,
    prefix,
    continuationToken: continuationToken ?? null,
  })
}

export function countObjects(connectionId: string, prefix: string) {
  return invoke<number>('count_objects', { connectionId, prefix })
}

export function previewImage(connectionId: string, key: string) {
  return invoke<ArrayBuffer>('preview_image', { connectionId, key })
}

export function previewText(connectionId: string, key: string) {
  return invoke<ArrayBuffer>('preview_text', { connectionId, key })
}

export function deleteObjects(connectionId: string, keys: string[]) {
  return invoke<DeleteObjectsResult>('delete_objects', { connectionId, keys })
}

export function createFolder(connectionId: string, prefix: string, name: string) {
  return invoke<void>('create_folder', { connectionId, prefix, name })
}
