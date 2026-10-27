import type { StorageItem } from '@/types/storage'
import {
  ArrowsOutCardinalIcon,
  CopyIcon,
  DownloadSimpleIcon,
  EyeIcon,
  InfoIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { ContextMenuGroup, ContextMenuItem } from '@/components/ui/context-menu'
import { DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import i18n from '@/i18n'
import { isTextPreviewable } from '@/lib/file-kind'
import { useFileTransferStore } from '@/store/file-transfer-store'

interface FileActionsMenuProps {
  item: StorageItem
  context?: boolean
  onDetails: (item: StorageItem) => void
  onPreview: (item: StorageItem) => void
  onDownload: (item: StorageItem) => void
  onCopy: (item: StorageItem) => void
  onMove: (item: StorageItem) => void
  onDelete: (item: StorageItem) => void
}

export function FileActionsMenu({
  item,
  context = false,
  onDetails,
  onPreview,
  onDownload,
  onCopy,
  onMove,
  onDelete,
}: FileActionsMenuProps) {
  const isDownloading = useFileTransferStore(state => Boolean(state.pendingDownload))
  const MenuGroup = context ? ContextMenuGroup : DropdownMenuGroup
  const MenuItem = context ? ContextMenuItem : DropdownMenuItem

  return (
    <MenuGroup>
      <MenuItem onClick={() => onDetails(item)}>
        <InfoIcon />
        {i18n.t('fileActions.details')}
      </MenuItem>
      {(item.kind === 'image' || (item.kind !== 'folder' && isTextPreviewable(item.name))) && (
        <MenuItem onClick={() => onPreview(item)}>
          <EyeIcon />
          {i18n.t('fileActions.preview')}
        </MenuItem>
      )}
      <MenuItem disabled={isDownloading} onClick={() => onDownload(item)}>
        <DownloadSimpleIcon />
        {i18n.t('common.download')}
      </MenuItem>
      <MenuItem onClick={() => onCopy(item)}>
        <CopyIcon />
        {i18n.t('common.copy')}
      </MenuItem>
      <MenuItem onClick={() => onMove(item)}>
        <ArrowsOutCardinalIcon />
        {i18n.t('common.move')}
      </MenuItem>
      <MenuItem variant="destructive" onClick={() => onDelete(item)}>
        <TrashIcon />
        {i18n.t('common.delete')}
      </MenuItem>
    </MenuGroup>
  )
}
