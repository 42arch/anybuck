import type { FileKind } from '@/types/storage'
import { FilePdfIcon, FileTextIcon, FileZipIcon, FolderIcon, ImageIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { fileKindColorClass } from './file-kind-styles'

interface FileKindIconProps {
  kind: FileKind
  size?: number
  className?: string
}

export function FileKindIcon({ kind, size = 18, className }: FileKindIconProps) {
  const iconProps = { size, weight: 'duotone' as const, className: cn(fileKindColorClass(kind), className) }

  switch (kind) {
    case 'folder': return <FolderIcon {...iconProps} />
    case 'image': return <ImageIcon {...iconProps} />
    case 'document': return <FilePdfIcon {...iconProps} />
    case 'archive': return <FileZipIcon {...iconProps} />
    default: return <FileTextIcon {...iconProps} />
  }
}
