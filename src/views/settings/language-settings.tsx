import type { LanguagePreference } from '@/store/settings-store'
import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSettingsStore } from '@/store/settings-store'

export function LanguageSettings() {
  const { t } = useTranslation()
  const language = useSettingsStore(state => state.language)
  const setLanguage = useSettingsStore(state => state.setLanguage)

  return (
    <section className="flex flex-col gap-3">
      <div className="pb-1">
        <h2 className="text-sm font-medium">{t('settings.language')}</h2>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="settings-language-select" className="text-xs sm:w-32 sm:shrink-0">{t('settings.languageLabel')}</label>
        <Select value={language} onValueChange={value => setLanguage(value as LanguagePreference)}>
          <SelectTrigger id="settings-language-select" className="min-w-44">
            <SelectValue>{t(language === 'system' ? 'settings.followSystem' : language === 'zh-CN' ? 'settings.chinese' : 'settings.english')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="system">{t('settings.followSystem')}</SelectItem>
              <SelectItem value="zh-CN">{t('settings.chinese')}</SelectItem>
              <SelectItem value="en-US">{t('settings.english')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </section>
  )
}
