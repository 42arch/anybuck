import type { StorageItem } from '@/types/storage'
import { ImagePreview } from './image-preview'
import { TextPreview } from './text-preview'

interface FilePreviewDialogProps {
  item: StorageItem | null
  connectionId?: string
  onClose: () => void
}

export function FilePreviewDialog({ item, connectionId, onClose }: FilePreviewDialogProps) {
  if (!item || !connectionId) {
    return null
  }

  const key = `${connectionId}:${item.id}:${item.updated}`

  if (item.kind === 'image') {
    return (
      <ImagePreview
        key={key}
        connectionId={connectionId}
        objectKey={item.id}
        name={item.name}
        sizeBytes={item.sizeBytes}
        mode="dialog"
        onClose={onClose}
      />
    )
  }

  return (
    <TextPreview
      key={key}
      connectionId={connectionId}
      objectKey={item.id}
      name={item.name}
      sizeBytes={item.sizeBytes}
      mode="dialog"
      onClose={onClose}
    />
  )
}
