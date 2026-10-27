import type { Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'
import { create } from 'zustand'
import { errorMessage } from '@/api/invoke'
import { listTransferTasks } from '@/api/transfers'
import i18n from '@/i18n'

type UpdatePhase = 'idle' | 'preparing' | 'downloading' | 'ready' | 'installing' | 'restart'

interface AppUpdateState {
  phase: UpdatePhase
  downloadedBytes: number
  totalBytes: number | null
  error: string | null
  startUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  restartApp: () => Promise<void>
}

let downloadedUpdate: Update | null = null

async function hasPendingTransfers() {
  const tasks = await listTransferTasks()
  return tasks.some(task => task.status === 'queued' || task.status === 'running')
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  phase: 'idle',
  downloadedBytes: 0,
  totalBytes: null,
  error: null,

  startUpdate: async () => {
    if (get().phase !== 'idle')
      return

    set({ phase: 'preparing', error: null })
    try {
      if (await hasPendingTransfers()) {
        set({ phase: 'idle', error: i18n.t('workflow.pendingTransfers') })
        return
      }

      set({ phase: 'downloading', downloadedBytes: 0, totalBytes: null, error: null })
      const update = await check()
      if (!update) {
        set({ phase: 'idle', error: i18n.t('workflow.noUpdateReady') })
        return
      }

      try {
        await update.download((event) => {
          if (event.event === 'Started')
            set({ totalBytes: event.data.contentLength ?? null })
          else if (event.event === 'Progress')
            set(state => ({ downloadedBytes: state.downloadedBytes + event.data.chunkLength }))
        })
        downloadedUpdate = update
        set({ phase: 'ready' })
      }
      catch (cause) {
        await update.close()
        throw cause
      }

      await get().installUpdate()
    }
    catch (cause) {
      set({ phase: 'idle', error: i18n.t('workflow.updateDownloadFailed', { message: errorMessage(cause) }) })
    }
  },

  installUpdate: async () => {
    if (get().phase !== 'ready' || !downloadedUpdate)
      return

    set({ phase: 'installing', error: null })
    try {
      if (await hasPendingTransfers()) {
        set({ phase: 'ready', error: i18n.t('workflow.downloadCompletePendingTransfers') })
        return
      }

      await downloadedUpdate.install()
      downloadedUpdate = null
      set({ phase: 'restart' })
      await get().restartApp()
    }
    catch (cause) {
      set({ phase: downloadedUpdate ? 'ready' : 'restart', error: i18n.t('workflow.updateInstallFailed', { message: errorMessage(cause) }) })
    }
  },

  restartApp: async () => {
    if (get().phase !== 'restart')
      return

    try {
      set({ error: null })
      await relaunch()
    }
    catch (cause) {
      set({ error: i18n.t('workflow.updateRestartFailed', { message: errorMessage(cause) }) })
    }
  },
}))
