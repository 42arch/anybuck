import type { View } from '@/types/view'

export const viewTitleKeys: Record<View, 'nav.files' | 'nav.transfers' | 'nav.recent' | 'common.settings'> = {
  files: 'nav.files',
  transfers: 'nav.transfers',
  recent: 'nav.recent',
  settings: 'common.settings',
}

export const viewPaths: Record<View, string> = {
  files: '/files',
  transfers: '/transfers',
  recent: '/recent',
  settings: '/settings',
}

export function viewFromPath(pathname: string): View {
  if (pathname.startsWith('/transfers'))
    return 'transfers'
  if (pathname.startsWith('/recent'))
    return 'recent'
  if (pathname.startsWith('/settings'))
    return 'settings'
  return 'files'
}
