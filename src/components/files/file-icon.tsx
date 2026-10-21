import type { FileKind } from '@/types/storage'
import { FilePdfIcon, FileTextIcon, FileZipIcon, FolderIcon, ImageIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const kindColors: Record<FileKind, string> = {
  folder: 'text-[#e6a642]',
  image: 'text-[#7994d2]',
  document: 'text-[#df7974]',
  archive: 'text-[#9c81c5]',
  file: 'text-[#7f9ca6]',
}

const kindSurfaces: Record<FileKind, string> = {
  folder: 'bg-[#fff3db]',
  image: 'bg-[#edf2fd]',
  document: 'bg-[#fdf0ef]',
  archive: 'bg-[#f4eff9]',
  file: 'bg-[#eff5f6]',
}

interface FileIconProps {
  kind: FileKind
  size?: number
  className?: string
}

export function FileIcon({ kind, size = 18, className }: FileIconProps) {
  const iconProps = { size, weight: 'duotone' as const, className: cn(kindColors[kind], className) }

  switch (kind) {
    case 'folder': return <FolderIcon {...iconProps} />
    case 'image': return <ImageIcon {...iconProps} />
    case 'document': return <FilePdfIcon {...iconProps} />
    case 'archive': return <FileZipIcon {...iconProps} />
    default: return <FileTextIcon {...iconProps} />
  }
}

export function FileBadge({ kind, size = 18, className }: FileIconProps) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center', kindSurfaces[kind], className)}>
      <FileIcon kind={kind} size={size} />
    </span>
  )
}
