import type { StorageItem } from '@/features/storage/models'
import {
  ArrowClockwise,
  ArrowDown,
  CaretRight,
  CloudArrowUp,
  Folder,
  GridFour,
  House,
  ListBullets,
  MagnifyingGlass,
  Plus,
  SidebarSimple,
  SlidersHorizontal,
  Trash,
} from '@phosphor-icons/react'
import { Fragment, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { FileDetails } from './file-details'
import { FileKindIcon } from './file-kind-icon'
import { fileKindSurfaceClass } from './file-kind-styles'

interface FileBrowserProps {
  bucketName: string
  path: string
  items: StorageItem[]
  focusedItem?: StorageItem
  selected: string[]
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
  onUnavailableAction: (label: string) => void
  onDelete: (items: StorageItem[]) => void | Promise<void>
  onConnect: () => void
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
    bucketName,
    path,
    items,
    focusedItem,
    selected,
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
    onUnavailableAction,
    onDelete,
    onConnect,
    isLoading = false,
    isLoadingMore = false,
    loadError = '',
    hasRemoteConnection = false,
    hasNextPage = false,
    onLoadMore,
    isDeleting = false,
  } = props
  const [deleteTargets, setDeleteTargets] = useState<StorageItem[]>([])
  const parts = path ? path.split('/') : []
  const currentName = parts[parts.length - 1] ?? bucketName
  const allSelected = items.length > 0 && items.every(item => selected.includes(item.id))

  return (
    <div className={cn('grid min-h-0 min-w-0 flex-1 gap-4', showDetails && 'xl:grid-cols-[minmax(0,1fr)_15rem]')}>
      <Card className="h-full min-h-0 min-w-0 gap-0">
        <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b px-4 py-4">
          <CardTitle className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Folder className="size-4" weight="duotone" /></span>
            <span className="truncate">{currentName}</span>
          </CardTitle>
          <CardDescription className="min-w-0 truncate">
            {items.length}
            {' 个项目位于当前目录'}
          </CardDescription>
          <CardAction className="row-span-2 flex items-center gap-2 self-center">
            <Button variant="outline" onClick={() => onUnavailableAction('新建文件夹')}>
              <Plus data-icon="inline-start" />
              新建文件夹
            </Button>
            <Button variant="outline" size="icon" aria-label="刷新文件列表" onClick={onRefresh}><ArrowClockwise /></Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 min-w-0 flex-col gap-0 overflow-y-auto px-0">
          {loadError && (
            <Alert variant="destructive" className="m-4 mb-0">
              <AlertTitle>无法读取 R2 对象</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<button type="button" onClick={() => onNavigate('')} aria-label="存储桶根目录" />}><House className="size-4" /></BreadcrumbLink>
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
                <InputGroupAddon><MagnifyingGlass /></InputGroupAddon>
                <InputGroupInput aria-label="搜索当前目录" placeholder="搜索当前目录..." value={search} onChange={event => onSearchChange(event.target.value)} />
              </InputGroup>
              <Button variant="outline" size="icon" aria-label="切换名称排序" onClick={onSortChange}><SlidersHorizontal /></Button>
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
                <ToggleGroupItem value="list" aria-label="列表视图"><ListBullets /></ToggleGroupItem>
                <ToggleGroupItem value="grid" aria-label="网格视图"><GridFour /></ToggleGroupItem>
              </ToggleGroup>
              <Button variant={showDetails ? 'secondary' : 'outline'} size="icon" aria-label="显示详情" aria-pressed={showDetails} onClick={() => onDetailsChange(!showDetails)}><SidebarSimple /></Button>
            </div>
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f8e9dc] bg-[#fff8f2] px-4 py-2 text-xs text-[#a76139]">
              <strong>
                已选择
                {selected.length}
                {' '}
                个项目
              </strong>
              <div className="flex items-center gap-1">
                <Button variant="ghost" onClick={() => onUnavailableAction('下载')}>下载</Button>
                <Button variant="ghost" onClick={() => onUnavailableAction('移动')}>移动</Button>
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTargets(items.filter(item => selected.includes(item.id)))}>
                  <Trash data-icon="inline-start" />
                  删除
                </Button>
                <Button variant="ghost" onClick={onClearSelection}>取消选择</Button>
              </div>
            </div>
          )}

          {items.length === 0
            ? (
                <Empty className="min-h-72">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">{isLoading ? <Spinner /> : hasRemoteConnection ? <MagnifyingGlass /> : <CloudArrowUp />}</EmptyMedia>
                    <EmptyTitle>{isLoading ? '正在读取对象…' : loadError ? '对象列表读取失败' : !hasRemoteConnection ? '尚未连接存储桶' : search ? '没有找到匹配的文件' : 'Bucket 暂无对象'}</EmptyTitle>
                    <EmptyDescription>{isLoading ? '正在从 Cloudflare R2 获取当前目录。' : loadError ? '请检查连接配置或网络后重试。' : !hasRemoteConnection ? '连接 Cloudflare R2 后即可浏览对象。' : search ? '试试其他搜索词' : '这个 Bucket 或目录当前没有对象。'}</EmptyDescription>
                  </EmptyHeader>
                  {!hasRemoteConnection && !isLoading && <Button onClick={onConnect}>前往设置并连接 R2</Button>}
                </Empty>
              )
            : grid
              ? (
                  <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
                    {items.map(item => (
                      <Button
                        key={item.id}
                        variant={focusedItem?.id === item.id ? 'secondary' : 'outline'}
                        className="h-auto min-w-0 flex-col gap-2 px-3 py-5"
                        onClick={() => onFocus(item.id)}
                        onDoubleClick={() => onOpenFolder(item)}
                      >
                        <FileKindIcon kind={item.kind} size={28} />
                        <span className="max-w-full truncate">{item.name}</span>
                        <span className="text-xs text-muted-foreground">{item.kind === 'folder' ? '文件夹' : item.size}</span>
                      </Button>
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
                            <ArrowDown data-icon="inline-end" className={cn('transition-transform', sortAscending && 'rotate-180')} />
                          </Button>
                        </TableHead>
                        <TableHead className="w-24">文件大小</TableHead>
                        <TableHead className="hidden w-32 lg:table-cell">修改时间</TableHead>
                        <TableHead className="w-10"><span className="sr-only">操作</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(item => (
                        <TableRow key={item.id} data-state={focusedItem?.id === item.id ? 'selected' : undefined} onClick={() => onFocus(item.id)} onDoubleClick={() => onOpenFolder(item)} className="cursor-pointer data-[state=selected]:bg-[#fffaf5]">
                          <TableCell onClick={event => event.stopPropagation()}><Checkbox aria-label={`选择 ${item.name}`} checked={selected.includes(item.id)} onCheckedChange={() => onToggleSelected(item.id)} /></TableCell>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', fileKindSurfaceClass(item.kind))}><FileKindIcon kind={item.kind} /></span>
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
                                      <CaretRight data-icon="inline-end" />
                                    </Button>
                                  )
                                : <span className="truncate font-medium">{item.name}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.size}</TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">{item.updated}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`删除 ${item.name}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                onFocus(item.id)
                                setDeleteTargets([item])
                              }}
                            >
                              <Trash />
                            </Button>
                          </TableCell>
                        </TableRow>
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
      {showDetails && <FileDetails item={focusedItem} path={path} onCopyKey={onCopyKey} onOpenFolder={onOpenFolder} onUnavailableAction={onUnavailableAction} onDelete={item => setDeleteTargets([item])} />}
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
    </div>
  )
}
