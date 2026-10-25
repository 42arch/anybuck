import type { ActiveStorageConnection } from '@/types/connection'

type ObjectUrlConnection = Pick<ActiveStorageConnection, 'provider' | 'bucket' | 'endpoint'>

export function getObjectUrl(connection: ObjectUrlConnection, key: string): string {
  const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/')
  const endpoint = new URL(connection.endpoint)

  if (connection.provider === 'aliyun-oss')
    endpoint.hostname = endpoint.hostname.replace(/^s3\.oss-/, 'oss-')

  if (connection.provider === 'volcengine-tos') {
    endpoint.hostname = `${connection.bucket}.${endpoint.hostname.replace(/^tos-s3-/, 'tos-')}`
    return `${endpoint.origin}/${encodedKey}`
  }

  if (connection.provider === 'google-cloud-storage')
    return `${endpoint.origin}/${encodeURIComponent(connection.bucket)}/${encodedKey}`

  if (connection.provider === 'aws-s3') {
    if (connection.bucket.includes('.'))
      return `${endpoint.origin}/${encodeURIComponent(connection.bucket)}/${encodedKey}`
    endpoint.hostname = `${connection.bucket}.${endpoint.hostname}`
    return `${endpoint.origin}/${encodedKey}`
  }

  if (connection.provider === 'tencent-cos' || connection.provider === 'aliyun-oss') {
    endpoint.hostname = `${connection.bucket}.${endpoint.hostname}`
    return `${endpoint.origin}/${encodedKey}`
  }

  return `${endpoint.origin}/${encodeURIComponent(connection.bucket)}/${encodedKey}`
}

export function getAuthenticatedBrowserUrl(connection: ObjectUrlConnection, key: string): string | null {
  if (connection.provider !== 'google-cloud-storage')
    return null
  const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/')
  return `https://storage.cloud.google.com/${encodeURIComponent(connection.bucket)}/${encodedKey}`
}

export function normalizePublicBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      return null
    return url.origin
  }
  catch {
    return null
  }
}

export function getPublicObjectUrl(connection: ObjectUrlConnection, key: string, publicBaseUrl?: string): string | null {
  if (!publicBaseUrl && (connection.provider === 'aws-s3' || connection.provider === 'google-cloud-storage'))
    return getObjectUrl(connection, key)
  const baseUrl = publicBaseUrl
    ? normalizePublicBaseUrl(publicBaseUrl)
    : connection.provider !== 'cloudflare-r2' && connection.provider !== 'qiniu-kodo' ? new URL(getObjectUrl(connection, key)).origin : null
  if (!baseUrl)
    return null
  const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/')
  return `${baseUrl}/${encodedKey}`
}
