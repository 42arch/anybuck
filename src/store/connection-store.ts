import type { ActiveStorageConnection } from '@/types/connection'
import { create } from 'zustand'

interface ConnectionState {
  sessionConnections: ActiveStorageConnection[]
  activeConnectionId: string | null
  selectionVersion: number
  selectConnection: (connectionId: string) => void
  rememberSessionConnection: (connection: ActiveStorageConnection) => void
  removeSessionConnection: (connectionId: string) => void
}

export const useConnectionStore = create<ConnectionState>(set => ({
  sessionConnections: [],
  activeConnectionId: null,
  selectionVersion: 0,
  selectConnection: activeConnectionId => set(state => ({
    activeConnectionId,
    selectionVersion: state.selectionVersion + 1,
  })),
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
