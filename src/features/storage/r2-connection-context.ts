import type { ConnectR2Request, R2ConnectionResult, SavedR2Connection } from '@/api/storage'
import { createContext, use } from 'react'

export type ActiveR2Connection = Pick<R2ConnectionResult, 'connectionId' | 'bucket' | 'endpoint'>
  & Pick<R2ConnectionResult, 'name'>

export interface R2ConnectionEntry extends ActiveR2Connection {
  connected: boolean
}

export interface R2ConnectionContextValue {
  connection: ActiveR2Connection | null
  connections: R2ConnectionEntry[]
  savedConnections: SavedR2Connection[]
  connectionListError: string
  isRestoring: boolean
  selectConnection: (connectionId: string) => void
  connect: (request: ConnectR2Request) => Promise<void>
  connectSavedConnection: (connectionId: string) => Promise<void>
  disconnectConnection: (connectionId: string) => Promise<void>
  forgetSavedConnection: (connectionId: string) => Promise<void>
}

export const R2ConnectionContext = createContext<R2ConnectionContextValue | null>(null)

export function useR2Connection() {
  const context = use(R2ConnectionContext)
  if (!context)
    throw new Error('useR2Connection must be used within R2ConnectionProvider')
  return context
}
