import type { FileKind } from '@/features/storage/models'
import { FilePdf, FileText, FileZip, Folder, Image } from '@phosphor-icons/react'
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
    case 'folder': return <Folder {...iconProps} />
    case 'image': return <Image {...iconProps} />
    case 'document': return <FilePdf {...iconProps} />
    case 'archive': return <FileZip {...iconProps} />
    default: return <FileText {...iconProps} />
  }
}
