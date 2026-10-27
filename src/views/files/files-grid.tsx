import type { StorageItem } from '@/types/storage'
import { DotsThreeIcon } from '@phosphor-icons/react'
import { FileIcon } from '@/components/files/file-icon'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import i18n from '@/i18n'
import { FileActionsMenu } from './file-actions-menu'

interface FilesGridProps {
  items: StorageItem[]
  focusedId?: string | null
  onFocus: (id: string) => void
  onOpenFolder: (item: StorageItem) => void
  onDetails: (item: StorageItem) => void
  onPreview: (item: StorageItem) => void
  onDownload: (item: StorageItem) => void
  onCopy: (item: StorageItem) => void
  onMove: (item: StorageItem) => void
  onDelete: (item: StorageItem) => void
}

export function FilesGrid({
  items,
  focusedId,
  onFocus,
  onOpenFolder,
  onDetails,
  onPreview,
  onDownload,
  onCopy,
  onMove,
  onDelete,
}: FilesGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 p-4">
      {items.map(item => (
        <ContextMenu key={item.id}>
          <ContextMenuTrigger render={<div className="relative w-full max-w-44 min-w-0" onContextMenu={() => onFocus(item.id)} />}>
            <Button
              variant={focusedId === item.id ? 'secondary' : 'outline'}
              className="aspect-square h-auto w-full min-w-0 flex-col gap-2 px-3 py-4"
              onClick={() => onFocus(item.id)}
              onDoubleClick={() => onOpenFolder(item)}
            >
              <FileIcon kind={item.kind} size={28} />
              <span className="max-w-full truncate">{item.name}</span>
              <span className="text-xs text-muted-foreground">{item.kind === 'folder' ? i18n.t('common.folder') : item.size}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" aria-label={i18n.t('dynamic.moreFileActions', { name: item.name })} />}>
                <DotsThreeIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <FileActionsMenu
                  item={item}
                  onDetails={onDetails}
                  onPreview={onPreview}
                  onDownload={onDownload}
                  onCopy={onCopy}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <FileActionsMenu
              item={item}
              context
              onDetails={onDetails}
              onPreview={onPreview}
              onDownload={onDownload}
              onCopy={onCopy}
              onMove={onMove}
              onDelete={onDelete}
            />
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </div>
  )
}
