import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface SettingsState {
  defaultDownloadPath: string
  publicBaseUrls: Record<string, string>
  setDefaultDownloadPath: (path: string) => void
  setPublicBaseUrl: (connectionId: string, url: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      defaultDownloadPath: '',
      publicBaseUrls: {},
      setDefaultDownloadPath: path => set({ defaultDownloadPath: path }),
      setPublicBaseUrl: (connectionId, url) => set((state) => {
        const publicBaseUrls = { ...state.publicBaseUrls }
        if (url)
          publicBaseUrls[connectionId] = url
        else
          delete publicBaseUrls[connectionId]
        return { publicBaseUrls }
      }),
    }),
    {
      name: 'cloudstore-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ defaultDownloadPath: state.defaultDownloadPath, publicBaseUrls: state.publicBaseUrls }),
    },
  ),
)
