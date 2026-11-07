import type { LanguagePreference } from '@/store/settings-store'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useSettingsStore } from '@/store/settings-store'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'

export type AppLanguage = 'zh-CN' | 'en-US'

export function resolveLanguage(preference: LanguagePreference): AppLanguage {
  if (preference !== 'system')
    return preference

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function applyLanguage(preference: LanguagePreference) {
  const language = resolveLanguage(preference)
  document.documentElement.lang = language
  document.title = language === 'zh-CN' ? 'AnyBuck — 对象存储工作台' : 'AnyBuck — Object Storage Workspace'
  if (i18n.isInitialized && i18n.language !== language)
    void i18n.changeLanguage(language)
}

const initialPreference = useSettingsStore.getState().language

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: resolveLanguage(initialPreference),
  fallbackLng: 'zh-CN',
  supportedLngs: ['zh-CN', 'en-US'],
  interpolation: { escapeValue: false },
  initAsync: false,
})

applyLanguage(initialPreference)
useSettingsStore.subscribe((state, previousState) => {
  if (state.language !== previousState.language)
    applyLanguage(state.language)
})

export default i18n
