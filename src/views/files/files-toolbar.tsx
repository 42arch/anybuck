import {
  ArrowClockwiseIcon,
  DotsThreeIcon,
  FolderIcon,
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
import i18n from '@/i18n'
import { cn } from '@/lib/utils'
import { useFileTransferStore } from '@/store/file-transfer-store'

const sidebarActiveToggleClass = 'data-[state=on]:bg-sidebar-accent data-[state=on]:text-sidebar-accent-foreground data-[state=on]:hover:bg-sidebar-accent data-[state=on]:hover:text-sidebar-accent-foreground'

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
  const uploadFolders = useFileTransferStore(state => state.uploadFolders)
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
                render={<button type="button" onClick={() => onNavigate('')} aria-label={i18n.t('filesToolbar.bucketRoot')} />}
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
              aria-label={i18n.t('filesToolbar.searchCurrentFolder')}
              placeholder={i18n.t('filesToolbar.searchCurrentFolderLabel')}
              value={search}
              onChange={event => onSearchChange(event.target.value)}
            />
          </InputGroup>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="icon-sm" aria-label={i18n.t('filesToolbar.uploadFilesFolders')} title={i18n.t('filesToolbar.uploadFilesFolders')} disabled={isUploading} />}
            >
              <UploadSimpleIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => void uploadFiles(path)}>
                  <UploadSimpleIcon data-icon="inline-start" />
                  {i18n.t('filesToolbar.chooseFiles')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void uploadFolders(path)}>
                  <FolderIcon data-icon="inline-start" />
                  {i18n.t('filesToolbar.chooseFolder')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={i18n.t('filesToolbar.newFolder')}
                  onClick={onCreateFolderClick}
                >
                  <PlusIcon />
                </Button>
              )}
            />
            <TooltipContent>{i18n.t('filesToolbar.newFolder')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button variant="outline" size="icon-sm" aria-label={i18n.t('filesToolbar.refreshFileList')} onClick={onRefresh}>
                  <ArrowClockwiseIcon />
                </Button>
              )}
            />
            <TooltipContent>{i18n.t('filesToolbar.refreshFileList')}</TooltipContent>
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
            aria-label={i18n.t('filesToolbar.fileView')}
          >
            <Tooltip>
              <TooltipTrigger
                render={(
                  <ToggleGroupItem value="list" aria-label={i18n.t('filesToolbar.listView')} className={sidebarActiveToggleClass}>
                    <ListBulletsIcon />
                  </ToggleGroupItem>
                )}
              />
              <TooltipContent>{i18n.t('filesToolbar.listView')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <ToggleGroupItem value="grid" aria-label={i18n.t('filesToolbar.gridView')} className={sidebarActiveToggleClass}>
                    <GridFourIcon />
                  </ToggleGroupItem>
                )}
              />
              <TooltipContent>{i18n.t('filesToolbar.gridView')}</TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </div>
      </div>
      {selectedCount > 0 && (
        <div className="absolute inset-0 flex items-center justify-between gap-2 bg-primary/5 px-4 text-xs text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
          <strong className="min-w-0 truncate font-medium">
            {i18n.t('filesToolbar.selected')}
            {' '}
            {selectedCount}
            {' '}
            {i18n.t('filesToolbar.selectedItemUnit')}
          </strong>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" disabled={isDownloading} onClick={onDownloadSelected}>
              {i18n.t('common.download')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={onCopySelected}
            >
              {i18n.t('common.copy')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={onMoveSelected}
            >
              {i18n.t('common.move')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-destructive hover:text-destructive sm:inline-flex"
              onClick={onDeleteSelected}
            >
              <TrashIcon data-icon="inline-start" />
              {i18n.t('common.delete')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="sm" className="sm:hidden" />}
              >
                <DotsThreeIcon data-icon="inline-start" />
                {i18n.t('common.more')}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onCopySelected}>
                    {i18n.t('common.copy')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onMoveSelected}>
                    {i18n.t('common.move')}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={onDeleteSelected}>
                    {i18n.t('common.delete')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={onClearSelection}>
              {i18n.t('filesToolbar.clearSelection')}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="sm:hidden"
              aria-label={i18n.t('filesToolbar.clearSelection')}
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
