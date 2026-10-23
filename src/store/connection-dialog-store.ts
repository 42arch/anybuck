import type { StorageProvider } from '@/types/connection'
import { create } from 'zustand'

interface ConnectionDialogState {
  open: boolean
  provider: StorageProvider
  dialogInstance: number
  openDialog: (provider?: StorageProvider) => void
  closeDialog: () => void
  setOpen: (open: boolean) => void
}

export const useConnectionDialogStore = create<ConnectionDialogState>(set => ({
  open: false,
  provider: 'cloudflare-r2',
  dialogInstance: 0,
  openDialog: (provider = 'cloudflare-r2') => set(state => ({
    open: true,
    provider,
    dialogInstance: state.dialogInstance + 1,
  })),
  closeDialog: () => set({ open: false }),
  setOpen: open => set({ open }),
}))
