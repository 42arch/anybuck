import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/api/invoke'
import i18n from '@/i18n'
import { showNotice } from '@/lib/notice'
import { useFileTransferStore } from '@/store/file-transfer-store'

interface UseFilesDragDropOptions {
  enabled: boolean
  path: string
}

export function useFilesDragDrop({ enabled, path }: UseFilesDragDropOptions) {
  const [dragOver, setDragOver] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const stageUpload = useFileTransferStore(state => state.stageUpload)
  const isUploading = useFileTransferStore(state => Boolean(state.isSelectingFiles || state.pendingUpload))

  useEffect(() => {
    if (!enabled || isUploading || !isTauri())
      return

    let disposed = false
    let unlisten: (() => void) | undefined

    void (async () => {
      const scaleFactor = await getCurrentWindow().scaleFactor()
      if (disposed)
        return

      unlisten = await getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === 'leave') {
          setDragOver(false)
          return
        }

        const position = payload.position.toLogical(scaleFactor)
        const bounds = dropZoneRef.current?.getBoundingClientRect()
        const inside = Boolean(
          bounds
          && position.x >= bounds.left
          && position.x <= bounds.right
          && position.y >= bounds.top
          && position.y <= bounds.bottom,
        )
        setDragOver(payload.type !== 'drop' && inside)

        if (payload.type === 'drop' && inside && payload.paths.length > 0)
          stageUpload(path, payload.paths)
      })

      if (disposed)
        unlisten()
    })().catch((error: unknown) => {
      setDragOver(false)
      if (!disposed)
        showNotice(i18n.t('workflow.dragDropFailed', { message: errorMessage(error) }))
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [enabled, isUploading, path, stageUpload])

  return { dragOver, dropZoneRef }
}
