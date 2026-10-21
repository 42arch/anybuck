import type { View } from '@/types/view'

export const viewTitles: Record<View, string> = {
  files: '文件管理',
  transfers: '任务中心',
  recent: '最近访问',
  settings: '设置',
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
