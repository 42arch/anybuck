import { invokeCommand } from '@/api/invoke'

export interface PublicAccessProbe {
  accessible: boolean
  statusCode: number
}

export function probePublicObjectUrl(url: string) {
  return invokeCommand<PublicAccessProbe>('probe_public_object_url', { url })
}
