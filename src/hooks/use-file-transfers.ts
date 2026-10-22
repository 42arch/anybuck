import type { ActiveR2Connection } from '@/types/connection'
import type { DownloadPlanSummary, PendingUpload } from '@/types/transfer'
import { open } from '@tauri-apps/plugin-dialog'
import { useState } from 'react'
import { enqueueR2Download, enqueueR2Uploads, prepareR2Download } from '@/api/transfers'

interface UseFileTransfersOptions {
  connection: ActiveR2Connection | null
  defaultDownloadPath: string
  setDefaultDownloadPath: (path: string) => void
  onNotice: (message: string) => void
}

export function useFileTransfers({ connection, defaultDownloadPath, setDefaultDownloadPath, onNotice }: UseFileTransfersOptions) {
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)
  const [pendingDownload, setPendingDownload] = useState<DownloadPlanSummary | null>(null)
  const [isSelectingFiles, setIsSelectingFiles] = useState(false)

  function stageUpload(prefix: string, paths: string[]) {
    if (pendingUpload || isSelectingFiles || paths.length === 0)
      return
    if (!connection) {
      onNotice('请先添加并连接存储桶。')
      return
    }

    setPendingUpload({ connectionId: connection.connectionId, bucket: connection.bucket, prefix, paths })
  }

  async function uploadFiles(prefix = '') {
    if (pendingUpload || isSelectingFiles)
      return
    if (!connection) {
      onNotice('请先添加并连接存储桶。')
      return
    }

    let selection: string | string[] | null
    setIsSelectingFiles(true)
    try {
      selection = await open({ multiple: true, directory: false, title: '选择要上传的文件' })
    }
    catch (cause) {
      onNotice(`无法打开文件选择器：${cause instanceof Error ? cause.message : String(cause)}`)
      return
    }
    finally {
      setIsSelectingFiles(false)
    }
    const paths = selection ? Array.isArray(selection) ? selection : [selection] : []
    if (paths.length === 0)
      return

    stageUpload(prefix, paths)
  }

  async function confirmUpload() {
    if (!pendingUpload)
      return

    const { connectionId, prefix, paths } = pendingUpload
    setPendingUpload(null)
    try {
      const tasks = await enqueueR2Uploads(connectionId, prefix, paths)
      onNotice(`已加入 ${tasks.length} 个上传任务。`)
    }
    catch (cause) {
      onNotice(`无法加入上传任务：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  async function downloadItems(prefix: string, items: { id: string, name: string }[]) {
    if (items.length === 0 || pendingUpload || pendingDownload || isSelectingFiles)
      return
    if (!connection) {
      onNotice('请先连接存储桶。')
      return
    }

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
        onNotice(`无法打开目录选择器：${cause instanceof Error ? cause.message : String(cause)}`)
        return
      }
    }

    try {
      const plan = await prepareR2Download(
        connection.connectionId,
        prefix,
        items.map(item => item.id),
        destinationPath,
      )
      if (plan.conflicts.length > 0) {
        setPendingDownload(plan)
      }
      else {
        const tasks = await enqueueR2Download(plan.planId, 'overwrite')
        onNotice(`已加入 ${tasks.filter(task => task.operation === 'download').length} 个下载任务。`)
      }
    }
    catch (cause) {
      onNotice(`无法加入下载任务：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  async function confirmDownload(conflictAction: 'overwrite' | 'skip') {
    if (!pendingDownload)
      return
    const plan = pendingDownload
    setPendingDownload(null)
    try {
      const tasks = await enqueueR2Download(plan.planId, conflictAction)
      onNotice(`已加入 ${tasks.filter(task => task.operation === 'download').length} 个下载任务。`)
    }
    catch (cause) {
      onNotice(`无法加入下载任务：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  return {
    pendingUpload,
    pendingDownload,
    isSelectingFiles,
    uploadFiles,
    stageUpload,
    downloadItems,
    confirmUpload,
    confirmDownload,
    cancelUpload: () => setPendingUpload(null),
    cancelDownload: () => setPendingDownload(null),
  }
}
