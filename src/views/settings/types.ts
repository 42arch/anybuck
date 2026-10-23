import type { Icon } from '@phosphor-icons/react'
import { CloudIcon, DownloadSimpleIcon } from '@phosphor-icons/react'

export type SettingsOption = 'connections' | 'download-path'

export interface SettingsItem {
  id: SettingsOption
  label: string
  icon: Icon
}

export const settingsItems: SettingsItem[] = [
  { id: 'connections', label: '连接管理', icon: CloudIcon },
  { id: 'download-path', label: '默认下载路径', icon: DownloadSimpleIcon },
]
