import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface SettingsState {
  defaultDownloadPath: string
  setDefaultDownloadPath: (path: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      defaultDownloadPath: '',
      setDefaultDownloadPath: path => set({ defaultDownloadPath: path }),
    }),
    {
      name: 'cloudstore-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ defaultDownloadPath: state.defaultDownloadPath }),
    },
  ),
)
