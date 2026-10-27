import type { ThemePreference } from '@/store/settings-store'
import { useSettingsStore } from '@/store/settings-store'

const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)')

function applyTheme(preference: ThemePreference) {
  const isDark = preference === 'dark' || (preference === 'system' && systemDarkMode.matches)
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#101827' : '#f7f8fa')
}

applyTheme(useSettingsStore.getState().theme)

useSettingsStore.subscribe((state, previousState) => {
  if (state.theme !== previousState.theme)
    applyTheme(state.theme)
})

systemDarkMode.addEventListener('change', () => {
  if (useSettingsStore.getState().theme === 'system')
    applyTheme('system')
})
