import { create } from 'zustand'

interface ConnectionDialogState {
  open: boolean
  dialogInstance: number
  openDialog: () => void
  closeDialog: () => void
  setOpen: (open: boolean) => void
}

export const useConnectionDialogStore = create<ConnectionDialogState>(set => ({
  open: false,
  dialogInstance: 0,
  openDialog: () => set(state => ({
    open: true,
    dialogInstance: state.dialogInstance + 1,
  })),
  closeDialog: () => set({ open: false }),
  setOpen: open => set({ open }),
}))
