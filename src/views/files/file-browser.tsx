import type { FormEvent } from 'react'
import type { ActiveR2Connection } from '@/types/connection'
import type { StorageItem } from '@/types/storage'
import {
  ArrowClockwiseIcon,
  ArrowDownIcon,
  ArrowsOutCardinalIcon,
  CaretRightIcon,
  CloudArrowUpIcon,
  CopyIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  EyeIcon,
  FolderIcon,
  GridFourIcon,
  HouseIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Fragment, useState } from 'react'
import { FileBadge, FileIcon } from '@/components/files/file-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { isTextPreviewable } from '@/lib/file-kind'
import { cn } from '@/lib/utils'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { FileDetails } from './file-details'
import { ImagePreview } from './image-preview'
import { ObjectDestinationDialog } from './object-destination-dialog'
import { TextPreview } from './text-preview'

interface FileBrowserProps {
  connection: ActiveR2Connection | null
  bucketName: string
  path: string
  items: StorageItem[]
  focusedItem?: StorageItem
  selected: string[]
  selectedItems: StorageItem[]
  search: string
  grid: boolean
  showDetails: boolean
  sortAscending: boolean
  onSearchChange: (value: string) => void
  onNavigate: (path: string) => void
  onFocus: (id: string) => void
  onOpenFolder: (item: StorageItem) => void
  onToggleSelected: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onGridChange: (grid: boolean) => void
  onDetailsChange: (show: boolean) => void
  onSortChange: () => void
  onRefresh: () => void
  onCopyKey: (key: string) => void
  onCopyUrl: (url: string) => void
  onCreateFolder: (name: string) => Promise<void>
  isCreatingFolder?: boolean
  onUnavailableAction: (label: string) => void
  onDelete: (items: StorageItem[]) => void | Promise<void>
  connectionId?: string
  onMove: (items: StorageItem[], destinationPrefix: string) => Promise<boolean>
  isMoving?: boolean
  onCopyObjects: (items: StorageItem[], destinationPrefix: string) => Promise<boolean>
  isCopying?: boolean
  onDownload: (items: StorageItem[]) => void
  isDownloading?: boolean
  onConnect: () => void
  onUpload: () => void
  isUploading?: boolean
  isLoading?: boolean
  isLoadingMore?: boolean
  loadError?: string
  hasRemoteConnection?: boolean
  hasNextPage?: boolean
  onLoadMore?: () => void
  isDeleting?: boolean
}

export function FileBrowser(props: FileBrowserProps) {
  const {
    connection,
    bucketName,
    path,
    items,
    focusedItem,
    selected,
    selectedItems,
    search,
    grid,
    showDetails,
    sortAscending,
    onSearchChange,
    onNavigate,
    onFocus,
    onOpenFolder,
    onToggleSelected,
    onSelectAll,
    onClearSelection,
    onGridChange,
    onDetailsChange,
    onSortChange,
    onRefresh,
    onCopyKey,
    onCopyUrl,
    onCreateFolder,
    isCreatingFolder = false,
    onUnavailableAction,
    onDelete,
    connectionId,
    onMove,
    isMoving = false,
    onCopyObjects,
    isCopying = false,
    onDownload,
    isDownloading = false,
    onConnect,
    onUpload,
    isUploading = false,
    isLoading = false,
    isLoadingMore = false,
    loadError = '',
    hasRemoteConnection = false,
    hasNextPage = false,
    onLoadMore,
    isDeleting = false,
  } = props
  const [deleteTargets, setDeleteTargets] = useState<StorageItem[]>([])
  const [destinationAction, setDestinationAction] = useState<{ operation: 'move' | 'copy', items: StorageItem[] } | null>(null)
  const [previewItem, setPreviewItem] = useState<StorageItem | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [createFolderError, setCreateFolderError] = useState('')
  const parts = path ? path.split('/') : []
  const currentName = parts[parts.length - 1] ?? bucketName
  const allSelected = items.length > 0 && items.every(item => selected.includes(item.id))

  async function submitCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = folderName.trim()
    if (!name) {
      setCreateFolderError('请输入文件夹名称。')
      return
    }
    setCreateFolderError('')
    try {
      await onCreateFolder(name)
      setCreateFolderOpen(false)
      setFolderName('')
    }
    catch (error) {
      setCreateFolderError(error instanceof Error ? error.message : String(error))
    }
  }

  function openDestination(operation: 'move' | 'copy', items: StorageItem[]) {
    if (!connectionId) {
      onUnavailableAction(operation === 'move' ? '移动' : '复制')
      return
    }
    setDestinationAction({ operation, items })
  }

  function renderFileActions(item: StorageItem, context: boolean) {
    const MenuGroup = context ? ContextMenuGroup : DropdownMenuGroup
    const MenuItem = context ? ContextMenuItem : DropdownMenuItem

    return (
      <MenuGroup>
        {(item.kind === 'image' || (item.kind !== 'folder' && isTextPreviewable(item.name))) && (
          <MenuItem onClick={() => setPreviewItem(item)}>
            <EyeIcon />
            预览
          </MenuItem>
        )}
        <MenuItem disabled={isDownloading} onClick={() => onDownload([item])}>
          <DownloadSimpleIcon />
          下载
        </MenuItem>
        <MenuItem disabled={isCopying} onClick={() => openDestination('copy', [item])}>
          <CopyIcon />
          复制
        </MenuItem>
        <MenuItem disabled={isMoving} onClick={() => openDestination('move', [item])}>
          <ArrowsOutCardinalIcon />
          移动
        </MenuItem>
        <MenuItem
          variant="destructive"
          onClick={() => {
            onFocus(item.id)
            setDeleteTargets([item])
          }}
        >
          <TrashIcon />
          删除
        </MenuItem>
      </MenuGroup>
    )
  }

  return (
    <div className={cn('grid min-h-0 min-w-0 flex-1 gap-4', showDetails && 'xl:grid-cols-[minmax(0,1fr)_15rem]')}>
      <Card size="sm" className="h-full min-h-0 min-w-0 gap-0">
        <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b px-4 pt-0">
          <CardTitle className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><FolderIcon className="size-4" weight="duotone" /></span>
            <span className="truncate">{currentName}</span>
          </CardTitle>
          <CardAction className="row-span-1 flex items-center gap-2 self-center">
            <Button onClick={onUpload} disabled={isUploading}>
              <UploadSimpleIcon data-icon="inline-start" />
              上传文件
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!hasRemoteConnection) {
                  onUnavailableAction('新建文件夹')
                  return
                }
                setCreateFolderError('')
                setCreateFolderOpen(true)
              }}
            >
              <PlusIcon data-icon="inline-start" />
              新建文件夹
            </Button>
            <Button variant="outline" size="icon" aria-label="刷新文件列表" onClick={onRefresh}><ArrowClockwiseIcon /></Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 min-w-0 flex-col gap-0 overflow-y-auto px-0">
          {loadError && (
            <Alert variant="destructive" className="m-4 mb-0">
              <AlertTitle>无法读取存储对象</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}
          <div className="relative border-b">
            <div
              className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3', selected.length > 0 && 'invisible')}
              aria-hidden={selected.length > 0}
              inert={selected.length > 0}
            >
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink render={<button type="button" onClick={() => onNavigate('')} aria-label="存储桶根目录" />}><HouseIcon className="size-4" /></BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {parts.length === 0
                      ? <BreadcrumbPage>{bucketName}</BreadcrumbPage>
                      : <BreadcrumbLink render={<button type="button" onClick={() => onNavigate('')} />}>{bucketName}</BreadcrumbLink>}
                  </BreadcrumbItem>
                  {parts.map((part, index) => {
                    const nextPath = parts.slice(0, index + 1).join('/')
                    return (
                      <Fragment key={nextPath}>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          {index === parts.length - 1
                            ? <BreadcrumbPage>{part}</BreadcrumbPage>
                            : <BreadcrumbLink render={<button type="button" onClick={() => onNavigate(nextPath)} />}>{part}</BreadcrumbLink>}
                        </BreadcrumbItem>
                      </Fragment>
                    )
                  })}
                </BreadcrumbList>
              </Breadcrumb>
              <div className="flex flex-wrap items-center gap-2">
                <InputGroup className="w-44 sm:w-52">
                  <InputGroupAddon><MagnifyingGlassIcon /></InputGroupAddon>
                  <InputGroupInput aria-label="搜索当前目录" placeholder="搜索当前目录..." value={search} onChange={event => onSearchChange(event.target.value)} />
                </InputGroup>
                <Button variant="outline" size="icon" aria-label="切换名称排序" onClick={onSortChange}><SlidersHorizontalIcon /></Button>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={[grid ? 'grid' : 'list']}
                  onValueChange={(value) => {
                    if (value.length > 0)
                      onGridChange(value[0] === 'grid')
                  }}
                  aria-label="文件视图"
                >
                  <ToggleGroupItem value="list" aria-label="列表视图"><ListBulletsIcon /></ToggleGroupItem>
                  <ToggleGroupItem value="grid" aria-label="网格视图"><GridFourIcon /></ToggleGroupItem>
                </ToggleGroup>
                <Button variant={showDetails ? 'secondary' : 'outline'} size="icon" aria-label="显示详情" aria-pressed={showDetails} onClick={() => onDetailsChange(!showDetails)}><SidebarSimpleIcon /></Button>
              </div>
            </div>
            {selected.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-between gap-2 bg-primary/5 px-4 text-xs text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
                <strong className="min-w-0 truncate font-medium">
                  已选择
                  {' '}
                  {selected.length}
                  {' '}
                  个项目
                </strong>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={isDownloading} onClick={() => onDownload(items.filter(item => selected.includes(item.id)))}>下载</Button>
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex" disabled={isCopying} onClick={() => openDestination('copy', selectedItems)}>复制</Button>
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex" disabled={isMoving} onClick={() => openDestination('move', selectedItems)}>移动</Button>
                  <Button variant="ghost" size="sm" className="hidden text-destructive hover:text-destructive sm:inline-flex" onClick={() => setDeleteTargets(items.filter(item => selected.includes(item.id)))}>
                    <TrashIcon data-icon="inline-start" />
                    删除
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="sm:hidden" />}>
                      <DotsThreeIcon data-icon="inline-start" />
                      更多
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem disabled={isCopying} onClick={() => openDestination('copy', selectedItems)}>复制</DropdownMenuItem>
                        <DropdownMenuItem disabled={isMoving} onClick={() => openDestination('move', selectedItems)}>移动</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTargets(items.filter(item => selected.includes(item.id)))}>删除</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={onClearSelection}>取消选择</Button>
                  <Button variant="ghost" size="icon-sm" className="sm:hidden" aria-label="取消选择" onClick={onClearSelection}><XIcon /></Button>
                </div>
              </div>
            )}
          </div>

          {items.length === 0
            ? (
                <Empty className="min-h-72">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">{isLoading ? <Spinner /> : hasRemoteConnection ? <MagnifyingGlassIcon /> : <CloudArrowUpIcon />}</EmptyMedia>
                    <EmptyTitle>{isLoading ? '正在读取对象…' : loadError ? '对象列表读取失败' : !hasRemoteConnection ? '尚未连接存储桶' : search ? '没有找到匹配的文件' : 'Bucket 暂无对象'}</EmptyTitle>
                    <EmptyDescription>{isLoading ? '正在读取当前目录。' : loadError ? '请检查连接配置或网络后重试。' : !hasRemoteConnection ? '连接存储桶后即可浏览对象。' : search ? '试试其他搜索词' : '这个 Bucket 或目录当前没有对象。'}</EmptyDescription>
                  </EmptyHeader>
                  {!hasRemoteConnection && !isLoading && <Button onClick={onConnect}>添加并连接存储桶</Button>}
                </Empty>
              )
            : grid
              ? (
                  <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
                    {items.map(item => (
                      <ContextMenu key={item.id}>
                        <ContextMenuTrigger render={<div className="relative min-w-0" onContextMenu={() => onFocus(item.id)} />}>
                          <Button
                            variant={focusedItem?.id === item.id ? 'secondary' : 'outline'}
                            className="h-auto w-full min-w-0 flex-col gap-2 px-3 py-5"
                            onClick={() => onFocus(item.id)}
                            onDoubleClick={() => onOpenFolder(item)}
                          >
                            <FileIcon kind={item.kind} size={28} />
                            <span className="max-w-full truncate">{item.name}</span>
                            <span className="text-xs text-muted-foreground">{item.kind === 'folder' ? '文件夹' : item.size}</span>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" aria-label={`${item.name} 的更多操作`} />}>
                              <DotsThreeIcon />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">{renderFileActions(item, false)}</DropdownMenuContent>
                          </DropdownMenu>
                        </ContextMenuTrigger>
                        <ContextMenuContent>{renderFileActions(item, true)}</ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </div>
                )
              : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#fbfcfd]">
                        <TableHead className="w-10"><Checkbox aria-label="选择当前目录全部项目" checked={allSelected} onCheckedChange={onSelectAll} /></TableHead>
                        <TableHead>
                          <Button variant="ghost" className="px-0" onClick={onSortChange}>
                            名称
                            <ArrowDownIcon data-icon="inline-end" className={cn('transition-transform', sortAscending && 'rotate-180')} />
                          </Button>
                        </TableHead>
                        <TableHead className="w-24">文件大小</TableHead>
                        <TableHead className="hidden w-32 lg:table-cell">修改时间</TableHead>
                        <TableHead className="w-10"><span className="sr-only">操作</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(item => (
                        <ContextMenu key={item.id}>
                          <ContextMenuTrigger render={<TableRow data-state={focusedItem?.id === item.id ? 'selected' : undefined} onClick={() => onFocus(item.id)} onDoubleClick={() => onOpenFolder(item)} onContextMenu={() => onFocus(item.id)} className="cursor-pointer data-[state=selected]:bg-[#fffaf5]" />}>
                            <TableCell onClick={event => event.stopPropagation()}><Checkbox aria-label={`选择 ${item.name}`} checked={selected.includes(item.id)} onCheckedChange={() => onToggleSelected(item.id)} /></TableCell>
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
                                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${item.name} 的更多操作`} />}>
                                  <DotsThreeIcon />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">{renderFileActions(item, false)}</DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </ContextMenuTrigger>
                          <ContextMenuContent>{renderFileActions(item, true)}</ContextMenuContent>
                        </ContextMenu>
                      ))}
                    </TableBody>
                  </Table>
                )}
        </CardContent>
        <CardFooter className="justify-between border-t pt-3 text-xs text-muted-foreground">
          <span>
            显示
            {items.length}
            {' '}
            个项目
          </span>
          {hasNextPage && onLoadMore
            ? (
                <Button variant="link" size="sm" className="h-auto p-0" disabled={isLoadingMore} onClick={onLoadMore}>
                  {isLoadingMore && <Spinner data-icon="inline-start" />}
                  {isLoadingMore ? '正在加载…' : '加载更多'}
                </Button>
              )
            : <span>{hasRemoteConnection ? '已加载全部对象' : '第 1 页'}</span>}
        </CardFooter>
      </Card>
      {showDetails && <FileDetails item={focusedItem} connection={connection} path={path} onCopyKey={onCopyKey} onCopyUrl={onCopyUrl} onOpenFolder={onOpenFolder} onDownload={onDownload} isDownloading={isDownloading} onDelete={item => setDeleteTargets([item])} />}
      {previewItem && connectionId && (
        previewItem.kind === 'image'
          ? (
              <ImagePreview
                key={`${connectionId}:${previewItem.id}:${previewItem.updated}`}
                connectionId={connectionId}
                objectKey={previewItem.id}
                name={previewItem.name}
                sizeBytes={previewItem.sizeBytes}
                mode="dialog"
                onClose={() => setPreviewItem(null)}
              />
            )
          : (
              <TextPreview
                key={`${connectionId}:${previewItem.id}:${previewItem.updated}`}
                connectionId={connectionId}
                objectKey={previewItem.id}
                name={previewItem.name}
                sizeBytes={previewItem.sizeBytes}
                mode="dialog"
                onClose={() => setPreviewItem(null)}
              />
            )
      )}
      <DeleteConfirmDialog
        open={deleteTargets.length > 0}
        names={deleteTargets.map(item => item.name)}
        folderCount={deleteTargets.filter(item => item.kind === 'folder').length}
        isDeleting={isDeleting}
        onOpenChange={open => !open && setDeleteTargets([])}
        onConfirm={async () => {
          await onDelete(deleteTargets)
          setDeleteTargets([])
        }}
      />
      {destinationAction && connectionId && (
        <ObjectDestinationDialog
          connectionId={connectionId}
          items={destinationAction.items}
          currentPath={path}
          operation={destinationAction.operation}
          isPending={destinationAction.operation === 'move' ? isMoving : isCopying}
          onOpenChange={open => !open && setDestinationAction(null)}
          onConfirm={destinationAction.operation === 'move' ? onMove : onCopyObjects}
        />
      )}
      <Dialog open={createFolderOpen} onOpenChange={open => !isCreatingFolder && setCreateFolderOpen(open)}>
        <DialogContent>
          <form onSubmit={submitCreateFolder} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>在当前目录新建文件夹</DialogTitle>
              <DialogDescription>
                将在
                {' '}
                {path ? `${path}/` : `${bucketName}/`}
                {' '}
                下创建文件夹。
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              aria-label="文件夹名称"
              placeholder="文件夹名称"
              value={folderName}
              onChange={event => setFolderName(event.target.value)}
              disabled={isCreatingFolder}
            />
            {createFolderError && <p className="text-xs text-destructive">{createFolderError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isCreatingFolder} onClick={() => setCreateFolderOpen(false)}>取消</Button>
              <Button type="submit" disabled={isCreatingFolder || !folderName.trim()}>
                {isCreatingFolder && <Spinner data-icon="inline-start" />}
                {isCreatingFolder ? '正在创建…' : '创建文件夹'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
