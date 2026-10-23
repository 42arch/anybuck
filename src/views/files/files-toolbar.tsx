import {
  ArrowClockwiseIcon,
  DotsThreeIcon,
  GridFourIcon,
  HouseIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Fragment } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useFileTransferStore } from '@/store/file-transfer-store'

interface FilesToolbarProps {
  bucketName: string
  path: string
  search: string
  grid: boolean
  selectedCount: number
  onNavigate: (path: string) => void
  onSearchChange: (value: string) => void
  onCreateFolderClick: () => void
  onRefresh: () => void
  onGridChange: (grid: boolean) => void
  onDownloadSelected: () => void
  onCopySelected: () => void
  onMoveSelected: () => void
  onDeleteSelected: () => void
  onClearSelection: () => void
}

export function FilesToolbar({
  bucketName,
  path,
  search,
  grid,
  selectedCount,
  onNavigate,
  onSearchChange,
  onCreateFolderClick,
  onRefresh,
  onGridChange,
  onDownloadSelected,
  onCopySelected,
  onMoveSelected,
  onDeleteSelected,
  onClearSelection,
}: FilesToolbarProps) {
  const uploadFiles = useFileTransferStore(state => state.uploadFiles)
  const isUploading = useFileTransferStore(state => Boolean(state.isSelectingFiles || state.pendingUpload))
  const isDownloading = useFileTransferStore(state => Boolean(state.pendingDownload))
  const parts = path ? path.split('/') : []
  return (
    <div className="relative shrink-0 border-b">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
          selectedCount > 0 && 'invisible',
        )}
        aria-hidden={selectedCount > 0}
        inert={selectedCount > 0}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                render={<button type="button" onClick={() => onNavigate('')} aria-label="存储桶根目录" />}
              >
                <HouseIcon className="size-4" />
              </BreadcrumbLink>
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
            <InputGroupInput
              aria-label="搜索当前目录"
              placeholder="搜索当前目录..."
              value={search}
              onChange={event => onSearchChange(event.target.value)}
            />
          </InputGroup>
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button size="icon-sm" aria-label="上传文件" onClick={() => void uploadFiles(path)} disabled={isUploading}>
                  <UploadSimpleIcon />
                </Button>
              )}
            />
            <TooltipContent>上传文件</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="新建文件夹"
                  onClick={onCreateFolderClick}
                >
                  <PlusIcon />
                </Button>
              )}
            />
            <TooltipContent>新建文件夹</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button variant="outline" size="icon-sm" aria-label="刷新文件列表" onClick={onRefresh}>
                  <ArrowClockwiseIcon />
                </Button>
              )}
            />
            <TooltipContent>刷新文件列表</TooltipContent>
          </Tooltip>
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
            <Tooltip>
              <TooltipTrigger
                render={(
                  <ToggleGroupItem value="list" aria-label="列表视图">
                    <ListBulletsIcon />
                  </ToggleGroupItem>
                )}
              />
              <TooltipContent>列表视图</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <ToggleGroupItem value="grid" aria-label="网格视图">
                    <GridFourIcon />
                  </ToggleGroupItem>
                )}
              />
              <TooltipContent>网格视图</TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </div>
      </div>
      {selectedCount > 0 && (
        <div className="absolute inset-0 flex items-center justify-between gap-2 bg-primary/5 px-4 text-xs text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
          <strong className="min-w-0 truncate font-medium">
            已选择
            {' '}
            {selectedCount}
            {' '}
            个项目
          </strong>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" disabled={isDownloading} onClick={onDownloadSelected}>
              下载
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={onCopySelected}
            >
              复制
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={onMoveSelected}
            >
              移动
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-destructive hover:text-destructive sm:inline-flex"
              onClick={onDeleteSelected}
            >
              <TrashIcon data-icon="inline-start" />
              删除
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="sm" className="sm:hidden" />}
              >
                <DotsThreeIcon data-icon="inline-start" />
                更多
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onCopySelected}>
                    复制
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onMoveSelected}>
                    移动
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={onDeleteSelected}>
                    删除
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={onClearSelection}>
              取消选择
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="sm:hidden"
              aria-label="取消选择"
              onClick={onClearSelection}
            >
              <XIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
