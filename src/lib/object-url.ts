import type { ActiveR2Connection } from '@/types/connection'

type ObjectUrlConnection = Pick<ActiveR2Connection, 'provider' | 'bucket' | 'endpoint'>

export function getObjectUrl(connection: ObjectUrlConnection, key: string): string {
  const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/')
  const endpoint = new URL(connection.endpoint)

  if (connection.provider === 'tencent-cos') {
    endpoint.hostname = `${connection.bucket}.${endpoint.hostname}`
    return `${endpoint.origin}/${encodedKey}`
  }

  return `${endpoint.origin}/${encodeURIComponent(connection.bucket)}/${encodedKey}`
}
