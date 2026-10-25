import type { StorageItem } from '@/types/storage'
import {
  ArrowDownIcon,
  CaretRightIcon,
  DotsThreeIcon,
} from '@phosphor-icons/react'
import { FileBadge } from '@/components/files/file-icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { FileActionsMenu } from './file-actions-menu'

interface FilesTableProps {
  items: StorageItem[]
  selected: string[]
  focusedId?: string | null
  sortAscending: boolean
  onSelectAll: () => void
  onToggleSelected: (item: StorageItem) => void
  onSortToggle: () => void
  onFocus: (id: string) => void
  onOpenFolder: (item: StorageItem) => void
  onDetails: (item: StorageItem) => void
  onPreview: (item: StorageItem) => void
  onDownload: (item: StorageItem) => void
  onCopy: (item: StorageItem) => void
  onMove: (item: StorageItem) => void
  onDelete: (item: StorageItem) => void
}

export function FilesTable({
  items,
  selected,
  focusedId,
  sortAscending,
  onSelectAll,
  onToggleSelected,
  onSortToggle,
  onFocus,
  onOpenFolder,
  onDetails,
  onPreview,
  onDownload,
  onCopy,
  onMove,
  onDelete,
}: FilesTableProps) {
  const allSelected = items.length > 0 && items.every(item => selected.includes(item.id))
  return (
    <Table containerClassName="overflow-visible">
      <TableHeader>
        <TableRow className="bg-[#fbfcfd]">
          <TableHead className="sticky top-0 z-10 w-10 bg-[#fbfcfd]">
            <Checkbox
              aria-label="选择或取消当前页全部项目"
              checked={allSelected}
              onCheckedChange={onSelectAll}
            />
          </TableHead>
          <TableHead className="sticky top-0 z-10 bg-[#fbfcfd]">
            <Button variant="ghost" className="px-0" onClick={onSortToggle} title="按当前页名称排序">
              名称
              <ArrowDownIcon
                data-icon="inline-end"
                className={cn('transition-transform', sortAscending && 'rotate-180')}
              />
            </Button>
          </TableHead>
          <TableHead className="sticky top-0 z-10 w-24 bg-[#fbfcfd]">文件大小</TableHead>
          <TableHead className="sticky top-0 z-10 hidden w-32 bg-[#fbfcfd] lg:table-cell">修改时间</TableHead>
          <TableHead className="sticky top-0 z-10 w-10 bg-[#fbfcfd]"><span className="sr-only">操作</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(item => (
          <ContextMenu key={item.id}>
            <ContextMenuTrigger
              render={(
                <TableRow
                  data-state={focusedId === item.id ? 'selected' : undefined}
                  onClick={() => onFocus(item.id)}
                  onDoubleClick={() => onOpenFolder(item)}
                  onContextMenu={() => onFocus(item.id)}
                  className="cursor-pointer data-[state=selected]:bg-[#fffaf5]"
                />
              )}
            >
              <TableCell onClick={event => event.stopPropagation()}>
                <Checkbox
                  aria-label={`选择 ${item.name}`}
                  checked={selected.includes(item.id)}
                  onCheckedChange={() => onToggleSelected(item)}
                />
              </TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2">
                  <FileBadge kind={item.kind} className="size-7 rounded-md" />
                  {item.kind === 'folder'
                    ? (
                        <Button
                          variant="link"
                          className="min-w-0 p-0 text-[#455366] hover:text-primary"
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenFolder(item)
                          }}
                        >
                          {item.name}
                          <CaretRightIcon data-icon="inline-end" />
                        </Button>
                      )
                    : <span className="truncate font-medium">{item.name}</span>}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{item.size}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{item.updated}</TableCell>
              <TableCell onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={(
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${item.name} 的更多操作`}
                      >
                        <DotsThreeIcon />
                      </Button>
                    )}
                  />
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
              </TableCell>
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
      </TableBody>
    </Table>
  )
}
