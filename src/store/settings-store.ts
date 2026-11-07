import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type LanguagePreference = 'system' | 'zh-CN' | 'en-US'
export type ThemePreference = 'system' | 'light' | 'dark'
export type DefaultFileView = 'list' | 'grid'

interface SettingsState {
  defaultDownloadPath: string
  publicBaseUrls: Record<string, string>
  language: LanguagePreference
  theme: ThemePreference
  defaultFileView: DefaultFileView
  setDefaultDownloadPath: (path: string) => void
  setPublicBaseUrl: (connectionId: string, url: string) => void
  setLanguage: (language: LanguagePreference) => void
  setTheme: (theme: ThemePreference) => void
  setDefaultFileView: (view: DefaultFileView) => void
}

if (typeof window !== 'undefined' && !localStorage.getItem('anybuck-settings')) {
  const legacySettings = localStorage.getItem('cloudstore-settings')
  if (legacySettings) {
    localStorage.setItem('anybuck-settings', legacySettings)
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      defaultDownloadPath: '',
      publicBaseUrls: {},
      language: 'system',
      theme: 'light',
      defaultFileView: 'list',
      setDefaultDownloadPath: path => set({ defaultDownloadPath: path }),
      setLanguage: language => set({ language }),
      setTheme: theme => set({ theme }),
      setDefaultFileView: defaultFileView => set({ defaultFileView }),
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
      name: 'anybuck-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ defaultDownloadPath: state.defaultDownloadPath, publicBaseUrls: state.publicBaseUrls, language: state.language, theme: state.theme, defaultFileView: state.defaultFileView }),
    },
  ),
)
