import { ArrowsOutIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { previewImage } from '@/api/objects'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import i18n from '@/i18n'

export const MAX_IMAGE_PREVIEW_BYTES = 8 * 1024 * 1024

const imageMimeTypes: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

type PreviewState
  = { status: 'loading' }
    | { status: 'ready', url: string }
    | { status: 'error', message: string }

interface ImagePreviewProps {
  connectionId: string
  objectKey: string
  name: string
  sizeBytes?: number
  mode?: 'thumbnail' | 'dialog'
  onClose?: () => void
}

export function ImagePreview({ connectionId, objectKey, name, sizeBytes, mode = 'thumbnail', onClose }: ImagePreviewProps) {
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [fullSizeOpen, setFullSizeOpen] = useState(false)
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = imageMimeTypes[extension] ?? 'application/octet-stream'
  const tooLarge = sizeBytes !== undefined && sizeBytes > MAX_IMAGE_PREVIEW_BYTES

  function retry() {
    setPreview({ status: 'loading' })
    setAttempt(value => value + 1)
  }

  useEffect(() => {
    if (tooLarge)
      return

    let active = true
    let objectUrl: string | undefined
    const timer = window.setTimeout(() => {
      void previewImage(connectionId, objectKey)
        .then((bytes) => {
          if (!active)
            return
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
          setPreview({ status: 'ready', url: objectUrl })
        })
        .catch((cause) => {
          if (active)
            setPreview({ status: 'error', message: errorMessage(cause) })
        })
    }, 100)

    return () => {
      active = false
      window.clearTimeout(timer)
      if (objectUrl)
        URL.revokeObjectURL(objectUrl)
    }
  }, [connectionId, objectKey, mimeType, tooLarge, attempt])

  function renderPreview(large: boolean) {
    if (tooLarge)
      return <p className="p-3 text-xs text-muted-foreground">{i18n.t('imagePreview.imageExceeds8MibDownload')}</p>

    if (preview.status === 'loading') {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner />
          {i18n.t('imagePreview.loadingImage')}
        </div>
      )
    }

    if (preview.status === 'error') {
      return (
        <div className="flex flex-col items-start gap-2 p-3 text-xs">
          <p className="break-words text-muted-foreground">{i18n.t('dynamic.previewFailed', { message: preview.message })}</p>
          <Button variant="outline" size="sm" onClick={retry}>{i18n.t('common.retry')}</Button>
        </div>
      )
    }

    return (
      <img
        src={preview.url}
        alt={name}
        className={large ? 'max-h-[75svh] max-w-full object-contain' : 'max-h-56 max-w-full object-contain'}
        onError={() => setPreview({ status: 'error', message: i18n.t('imagePreview.unsupportedImageFormatDamagedFile') })}
      />
    )
  }

  function changeDialogOpen(open: boolean) {
    if (mode === 'dialog') {
      if (!open)
        onClose?.()
      return
    }
    setFullSizeOpen(open)
  }

  return (
    <>
      {mode === 'thumbnail' && (
        <div className="flex w-full min-w-0 flex-col gap-2">
          <div className="flex min-h-36 items-center justify-center rounded-md bg-muted/50 p-2">
            {renderPreview(false)}
          </div>
          {preview.status === 'ready' && !tooLarge && (
            <Button variant="outline" size="sm" className="self-start" onClick={() => setFullSizeOpen(true)}>
              <ArrowsOutIcon data-icon="inline-start" />
              {i18n.t('imagePreview.viewFullImage')}
            </Button>
          )}
        </div>
      )}
      <Dialog open={mode === 'dialog' || fullSizeOpen} onOpenChange={changeDialogOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem)] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate">{name}</DialogTitle>
            <DialogDescription>{i18n.t('imagePreview.imagePreview')}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-36 items-center justify-center overflow-auto rounded-md bg-muted/50 p-2">
            {renderPreview(true)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
