import type { DeleteR2ObjectsResult, R2ObjectPage } from '@/types/storage'
import { invoke } from '@tauri-apps/api/core'

export function listR2Objects(connectionId: string, prefix: string, continuationToken?: string | null) {
  return invoke<R2ObjectPage>('list_r2_objects', {
    connectionId,
    prefix,
    continuationToken: continuationToken ?? null,
  })
}

export function previewR2Image(connectionId: string, key: string) {
  return invoke<ArrayBuffer>('preview_r2_image', { connectionId, key })
}

export function previewR2Text(connectionId: string, key: string) {
  return invoke<ArrayBuffer>('preview_r2_text', { connectionId, key })
}

export function deleteR2Objects(connectionId: string, keys: string[]) {
  return invoke<DeleteR2ObjectsResult>('delete_r2_objects', { connectionId, keys })
}

export function createR2Folder(connectionId: string, prefix: string, name: string) {
  return invoke<void>('create_r2_folder', { connectionId, prefix, name })
}
