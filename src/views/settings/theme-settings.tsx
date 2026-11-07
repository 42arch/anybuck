import type { DefaultFileView, ThemePreference } from '@/store/settings-store'
import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSettingsStore } from '@/store/settings-store'

export function ThemeSettings() {
  const { t } = useTranslation()
  const theme = useSettingsStore(state => state.theme)
  const setTheme = useSettingsStore(state => state.setTheme)
  const defaultFileView = useSettingsStore(state => state.defaultFileView)
  const setDefaultFileView = useSettingsStore(state => state.setDefaultFileView)

  return (
    <section className="flex flex-col gap-3">
      <div className="pb-1">
        <h2 className="text-sm font-medium">{t('settings.theme')}</h2>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="settings-theme-select" className="text-xs sm:w-32 sm:shrink-0">{t('settings.themeLabel')}</label>
        <Select value={theme} onValueChange={value => setTheme(value as ThemePreference)}>
          <SelectTrigger id="settings-theme-select" className="min-w-44">
            <SelectValue>{t(theme === 'system' ? 'settings.followSystem' : theme === 'dark' ? 'settings.darkTheme' : 'settings.lightTheme')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="system">{t('settings.followSystem')}</SelectItem>
              <SelectItem value="light">{t('settings.lightTheme')}</SelectItem>
              <SelectItem value="dark">{t('settings.darkTheme')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="settings-default-file-view-select" className="text-xs sm:w-32 sm:shrink-0">{t('settings.defaultFileView')}</label>
        <Select value={defaultFileView} onValueChange={value => setDefaultFileView(value as DefaultFileView)}>
          <SelectTrigger id="settings-default-file-view-select" className="min-w-44">
            <SelectValue>{t(defaultFileView === 'grid' ? 'filesToolbar.gridView' : 'filesToolbar.listView')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="list">{t('filesToolbar.listView')}</SelectItem>
              <SelectItem value="grid">{t('filesToolbar.gridView')}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </section>
  )
}
