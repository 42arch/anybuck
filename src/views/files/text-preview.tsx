import { ArrowsOutIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { previewText } from '@/api/objects'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import i18n from '@/i18n'

const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024

type PreviewState
  = { status: 'loading' }
    | { status: 'ready', text: string }
    | { status: 'error', message: string }

interface TextPreviewProps {
  connectionId: string
  objectKey: string
  name: string
  sizeBytes?: number
  mode?: 'snippet' | 'dialog'
  onClose?: () => void
}

export function TextPreview({ connectionId, objectKey, name, sizeBytes, mode = 'snippet', onClose }: TextPreviewProps) {
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [fullSizeOpen, setFullSizeOpen] = useState(false)
  const tooLarge = sizeBytes !== undefined && sizeBytes > MAX_TEXT_PREVIEW_BYTES

  function retry() {
    setPreview({ status: 'loading' })
    setAttempt(value => value + 1)
  }

  useEffect(() => {
    if (tooLarge)
      return

    let active = true
    const timer = window.setTimeout(() => {
      void previewText(connectionId, objectKey)
        .then((bytes) => {
          if (!active)
            return
          try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
            if (text.includes('\0'))
              throw new Error(i18n.t('textPreview.fileContainsNonTextContent'))
            setPreview({ status: 'ready', text })
          }
          catch {
            setPreview({ status: 'error', message: i18n.t('textPreview.utf8TextSupportedDownloadFile') })
          }
        })
        .catch((cause) => {
          if (active)
            setPreview({ status: 'error', message: errorMessage(cause) })
        })
    }, 100)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [connectionId, objectKey, tooLarge, attempt])

  function renderPreview(full: boolean) {
    if (tooLarge)
      return <p className="p-3 text-xs text-muted-foreground">{i18n.t('textPreview.textExceeds1MibDownload')}</p>

    if (preview.status === 'loading') {
      return (
        <div className="flex min-h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner />
          {i18n.t('textPreview.readingText')}
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

    return preview.text
      ? <pre className={full ? 'max-h-[70svh] w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs' : 'max-h-48 w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs'}>{preview.text}</pre>
      : <p className="text-xs text-muted-foreground">{i18n.t('textPreview.fileEmpty')}</p>
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
      {mode === 'snippet' && (
        <div className="flex w-full min-w-0 flex-col gap-2 text-left">
          <div className="min-h-24 rounded-md bg-muted/50 p-2">
            {renderPreview(false)}
          </div>
          {preview.status === 'ready' && !tooLarge && (
            <Button variant="outline" size="sm" className="self-start" onClick={() => setFullSizeOpen(true)}>
              <ArrowsOutIcon data-icon="inline-start" />
              {i18n.t('textPreview.viewFullText')}
            </Button>
          )}
        </div>
      )}
      <Dialog open={mode === 'dialog' || fullSizeOpen} onOpenChange={changeDialogOpen}>
        <DialogContent className="flex max-h-[calc(100svh-2rem)] min-h-0 flex-col sm:max-w-5xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="truncate">{name}</DialogTitle>
            <DialogDescription>{i18n.t('textPreview.readTextPreviewUtf8')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-24 overflow-auto rounded-md bg-muted/50 p-3">
            {renderPreview(true)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
