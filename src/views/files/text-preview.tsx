import { ArrowsOutIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { previewText } from '@/api/objects'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'

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
              throw new Error('文件包含非文本内容。')
            setPreview({ status: 'ready', text })
          }
          catch {
            setPreview({ status: 'error', message: '仅支持 UTF-8 文本；其他编码请下载后查看。' })
          }
        })
        .catch((cause) => {
          if (active)
            setPreview({ status: 'error', message: cause instanceof Error ? cause.message : String(cause) })
        })
    }, 100)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [connectionId, objectKey, tooLarge, attempt])

  function renderPreview(full: boolean) {
    if (tooLarge)
      return <p className="p-3 text-xs text-muted-foreground">文本超过 1 MiB，请下载后查看。</p>

    if (preview.status === 'loading') {
      return (
        <div className="flex min-h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner />
          正在读取文本…
        </div>
      )
    }

    if (preview.status === 'error') {
      return (
        <div className="flex flex-col items-start gap-2 p-3 text-xs">
          <p className="break-words text-muted-foreground">{`预览失败：${preview.message}`}</p>
          <Button variant="outline" size="sm" onClick={retry}>重试</Button>
        </div>
      )
    }

    return preview.text
      ? <pre className={full ? 'max-h-[70svh] w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs' : 'max-h-48 w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs'}>{preview.text}</pre>
      : <p className="text-xs text-muted-foreground">文件内容为空。</p>
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
              查看全文
            </Button>
          )}
        </div>
      )}
      <Dialog open={mode === 'dialog' || fullSizeOpen} onOpenChange={changeDialogOpen}>
        <DialogContent className="flex max-h-[calc(100svh-2rem)] min-h-0 flex-col sm:max-w-5xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="truncate">{name}</DialogTitle>
            <DialogDescription>只读文本预览（UTF-8）</DialogDescription>
          </DialogHeader>
          <div className="min-h-24 overflow-auto rounded-md bg-muted/50 p-3">
            {renderPreview(true)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
