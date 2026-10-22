import { invoke } from '@tauri-apps/api/core'

export interface PublicAccessProbe {
  accessible: boolean
  statusCode: number
}

export function probePublicObjectUrl(url: string) {
  return invoke<PublicAccessProbe>('probe_public_object_url', { url })
}
