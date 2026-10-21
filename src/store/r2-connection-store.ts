import type { ActiveR2Connection } from '@/types/connection'
import { create } from 'zustand'

interface R2ConnectionState {
  sessionConnections: ActiveR2Connection[]
  activeConnectionId: string | null
  selectConnection: (connectionId: string) => void
  rememberSessionConnection: (connection: ActiveR2Connection) => void
  removeSessionConnection: (connectionId: string) => void
}

export const useR2ConnectionStore = create<R2ConnectionState>(set => ({
  sessionConnections: [],
  activeConnectionId: null,
  selectConnection: activeConnectionId => set({ activeConnectionId }),
  rememberSessionConnection: connection => set((state) => {
    const sessionConnections = [
      ...state.sessionConnections.filter(item => item.connectionId !== connection.connectionId),
      connection,
    ]
    return { sessionConnections, activeConnectionId: connection.connectionId }
  }),
  removeSessionConnection: connectionId => set(state => ({
    sessionConnections: state.sessionConnections.filter(item => item.connectionId !== connectionId),
    activeConnectionId: state.activeConnectionId === connectionId ? null : state.activeConnectionId,
  })),
}))
