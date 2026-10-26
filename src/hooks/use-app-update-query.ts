import { useQuery } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { check } from '@tauri-apps/plugin-updater'

export interface AppUpdateInfo {
  version: string
  currentVersion: string
  body: string | null
  date: string | null
}

export const canCheckForUpdates = import.meta.env.PROD && isTauri()

export function useAppUpdateQuery() {
  return useQuery({
    queryKey: ['app-update'],
    queryFn: async (): Promise<AppUpdateInfo | null> => {
      const update = await check()
      if (!update)
        return null

      try {
        return {
          version: update.version,
          currentVersion: update.currentVersion,
          body: update.body ?? null,
          date: update.date ?? null,
        }
      }
      finally {
        await update.close()
      }
    },
    enabled: canCheckForUpdates,
    retry: false,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
