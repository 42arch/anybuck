import type { Icon } from '@phosphor-icons/react'
import { CloudIcon, GearIcon, SlidersHorizontalIcon } from '@phosphor-icons/react'

export type SettingsOption = 'connections' | 'general' | 'app-update'

export interface SettingsItem {
  id: SettingsOption
  labelKey: 'settings.connections' | 'settings.general' | 'settings.appUpdate'
  icon: Icon
}

export const settingsItems: SettingsItem[] = [
  { id: 'general', labelKey: 'settings.general', icon: SlidersHorizontalIcon },
  { id: 'connections', labelKey: 'settings.connections', icon: CloudIcon },
  { id: 'app-update', labelKey: 'settings.appUpdate', icon: GearIcon },
]
