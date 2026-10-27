import type { ActiveStorageConnection } from '@/types/connection'
import type { DownloadPlanSummary, PendingUpload, UploadConflictAction } from '@/types/transfer'
import { open } from '@tauri-apps/plugin-dialog'
import { create } from 'zustand'
import { errorMessage } from '@/api/invoke'
import { enqueueDownload, enqueueUploads, prepareDownload } from '@/api/transfers'
import i18n from '@/i18n'
import { showNotice } from '@/lib/notice'
import { useConnectionStore } from '@/store/connection-store'
import { useSettingsStore } from '@/store/settings-store'

export interface FileTransferState {
  pendingUpload: PendingUpload | null
  pendingDownload: DownloadPlanSummary | null
  isSelectingFiles: boolean
  isEnqueuingUpload: boolean

  stageUpload: (prefix: string, paths: string[]) => void
  uploadFiles: (prefix?: string) => Promise<void>
  uploadFolders: (prefix?: string) => Promise<void>
  confirmUpload: (conflictAction: UploadConflictAction) => Promise<void>
  cancelUpload: () => void
  downloadItems: (prefix: string, items: { id: string, name: string }[]) => Promise<void>
  confirmDownload: (conflictAction: 'overwrite' | 'skip') => Promise<void>
  cancelDownload: () => void
}

function getActiveConnection(): ActiveStorageConnection | null {
  const { sessionConnections, activeConnectionId } = useConnectionStore.getState()
  return sessionConnections.find(item => item.connectionId === activeConnectionId) ?? null
}

export const useFileTransferStore = create<FileTransferState>((set, get) => ({
  pendingUpload: null,
  pendingDownload: null,
  isSelectingFiles: false,
  isEnqueuingUpload: false,

  stageUpload: (prefix: string, paths: string[]) => {
    const { pendingUpload, isSelectingFiles } = get()
    if (pendingUpload || isSelectingFiles || paths.length === 0)
      return

    const connection = getActiveConnection()
    if (!connection) {
      showNotice(i18n.t('workflow.connectBucketFirst'))
      return
    }

    set({ pendingUpload: { connectionId: connection.connectionId, bucket: connection.bucket, prefix, paths } })
  },

  uploadFiles: async (prefix = '') => {
    const { pendingUpload, isSelectingFiles, stageUpload } = get()
    if (pendingUpload || isSelectingFiles)
      return

    const connection = getActiveConnection()
    if (!connection) {
      showNotice(i18n.t('workflow.connectBucketFirst'))
      return
    }

    let selection: string | string[] | null
    set({ isSelectingFiles: true })
    try {
      selection = await open({ multiple: true, directory: false, title: i18n.t('workflow.chooseUploadFiles') })
    }
    catch (cause) {
      showNotice(i18n.t('workflow.filePickerFailed', { message: errorMessage(cause) }))
      return
    }
    finally {
      set({ isSelectingFiles: false })
    }

    const paths = selection ? Array.isArray(selection) ? selection : [selection] : []
    if (paths.length === 0)
      return

    stageUpload(prefix, paths)
  },

  uploadFolders: async (prefix = '') => {
    const { pendingUpload, isSelectingFiles, stageUpload } = get()
    if (pendingUpload || isSelectingFiles)
      return

    if (!getActiveConnection()) {
      showNotice(i18n.t('workflow.connectBucketFirst'))
      return
    }

    let selection: string | string[] | null
    set({ isSelectingFiles: true })
    try {
      selection = await open({ multiple: true, directory: true, title: i18n.t('workflow.chooseUploadFolders') })
    }
    catch (cause) {
      showNotice(i18n.t('workflow.folderPickerFailed', { message: errorMessage(cause) }))
      return
    }
    finally {
      set({ isSelectingFiles: false })
    }

    const paths = selection ? Array.isArray(selection) ? selection : [selection] : []
    if (paths.length > 0)
      stageUpload(prefix, paths)
  },

  confirmUpload: async (conflictAction) => {
    const { pendingUpload, isEnqueuingUpload } = get()
    if (!pendingUpload || isEnqueuingUpload)
      return

    const { connectionId, prefix, paths } = pendingUpload
    set({ isEnqueuingUpload: true })
    try {
      const tasks = await enqueueUploads(connectionId, prefix, paths, conflictAction)
      set({ pendingUpload: null })
      const fileCount = tasks.filter(task => task.operation === 'upload').length
      const emptyFolderCount = tasks.filter(task => task.operation === 'upload-marker').length
      showNotice(i18n.t('workflow.uploadsQueued', { files: fileCount, folders: emptyFolderCount > 0 ? i18n.t('workflow.emptyFolders', { count: emptyFolderCount }) : '' }))
    }
    catch (cause) {
      set({ pendingUpload: null })
      showNotice(i18n.t('workflow.uploadQueueFailed', { message: errorMessage(cause) }))
    }
    finally {
      set({ isEnqueuingUpload: false })
    }
  },

  cancelUpload: () => {
    if (!get().isEnqueuingUpload)
      set({ pendingUpload: null })
  },

  downloadItems: async (prefix: string, items: { id: string, name: string }[]) => {
    const { pendingUpload, pendingDownload, isSelectingFiles } = get()
    if (items.length === 0 || pendingUpload || pendingDownload || isSelectingFiles)
      return

    const connection = getActiveConnection()
    if (!connection) {
      showNotice(i18n.t('workflow.connectExistingBucketFirst'))
      return
    }

    const { defaultDownloadPath, setDefaultDownloadPath } = useSettingsStore.getState()
    let destinationPath = defaultDownloadPath
    if (!destinationPath) {
      try {
        const selectedPath = await open({ directory: true, multiple: false, title: i18n.t('workflow.chooseDownloadLocation') })
        if (typeof selectedPath !== 'string')
          return
        destinationPath = selectedPath
        setDefaultDownloadPath(selectedPath)
      }
      catch (cause) {
        showNotice(i18n.t('workflow.directoryPickerFailed', { message: errorMessage(cause) }))
        return
      }
    }

    try {
      const plan = await prepareDownload(
        connection.connectionId,
        prefix,
        items.map(item => item.id),
        destinationPath,
      )
      if (plan.conflicts.length > 0) {
        set({ pendingDownload: plan })
      }
      else {
        const tasks = await enqueueDownload(plan.planId, 'overwrite')
        showNotice(i18n.t('workflow.downloadsQueued', { count: tasks.filter(task => task.operation === 'download').length }))
      }
    }
    catch (cause) {
      showNotice(i18n.t('workflow.downloadQueueFailed', { message: errorMessage(cause) }))
    }
  },

  confirmDownload: async (conflictAction: 'overwrite' | 'skip') => {
    const { pendingDownload } = get()
    if (!pendingDownload)
      return
    const plan = pendingDownload
    set({ pendingDownload: null })
    try {
      const tasks = await enqueueDownload(plan.planId, conflictAction)
      showNotice(i18n.t('workflow.downloadsQueued', { count: tasks.filter(task => task.operation === 'download').length }))
    }
    catch (cause) {
      showNotice(i18n.t('workflow.downloadQueueFailed', { message: errorMessage(cause) }))
    }
  },

  cancelDownload: () => set({ pendingDownload: null }),
}))
