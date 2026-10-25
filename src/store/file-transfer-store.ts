import type { ActiveStorageConnection } from '@/types/connection'
import type { DownloadPlanSummary, PendingUpload, UploadConflictAction } from '@/types/transfer'
import { open } from '@tauri-apps/plugin-dialog'
import { create } from 'zustand'
import { enqueueDownload, enqueueUploads, prepareDownload } from '@/api/transfers'
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
      showNotice('请先添加并连接存储桶。')
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
      showNotice('请先添加并连接存储桶。')
      return
    }

    let selection: string | string[] | null
    set({ isSelectingFiles: true })
    try {
      selection = await open({ multiple: true, directory: false, title: '选择要上传的文件' })
    }
    catch (cause) {
      showNotice(`无法打开文件选择器：${cause instanceof Error ? cause.message : String(cause)}`)
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
      showNotice('请先添加并连接存储桶。')
      return
    }

    let selection: string | string[] | null
    set({ isSelectingFiles: true })
    try {
      selection = await open({ multiple: true, directory: true, title: '选择要上传的文件夹' })
    }
    catch (cause) {
      showNotice(`无法打开文件夹选择器：${cause instanceof Error ? cause.message : String(cause)}`)
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
      showNotice(`已加入 ${fileCount} 个文件${emptyFolderCount > 0 ? `和 ${emptyFolderCount} 个空文件夹` : ''}上传任务。`)
    }
    catch (cause) {
      set({ pendingUpload: null })
      showNotice(`无法加入上传任务：${cause instanceof Error ? cause.message : String(cause)}`)
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
      showNotice('请先连接存储桶。')
      return
    }

    const { defaultDownloadPath, setDefaultDownloadPath } = useSettingsStore.getState()
    let destinationPath = defaultDownloadPath
    if (!destinationPath) {
      try {
        const selectedPath = await open({ directory: true, multiple: false, title: '选择下载位置' })
        if (typeof selectedPath !== 'string')
          return
        destinationPath = selectedPath
        setDefaultDownloadPath(selectedPath)
      }
      catch (cause) {
        showNotice(`无法打开目录选择器：${cause instanceof Error ? cause.message : String(cause)}`)
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
        showNotice(`已加入 ${tasks.filter(task => task.operation === 'download').length} 个下载任务。`)
      }
    }
    catch (cause) {
      showNotice(`无法加入下载任务：${cause instanceof Error ? cause.message : String(cause)}`)
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
      showNotice(`已加入 ${tasks.filter(task => task.operation === 'download').length} 个下载任务。`)
    }
    catch (cause) {
      showNotice(`无法加入下载任务：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  },

  cancelDownload: () => set({ pendingDownload: null }),
}))
