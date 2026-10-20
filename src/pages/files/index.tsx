import type { R2Object } from '@/api/storage'
import type { R2ConnectionEntry } from '@/store/r2-connection-store'
import type { StorageItem } from '@/types/storage'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { copyR2Objects, createR2Folder, deleteR2Objects, listR2Objects, moveR2Objects } from '@/api/storage'
import { useR2Connection } from '@/store/r2-connection-store'
import { FileBrowser } from './file-browser'
import { toStorageItems } from './storage-item-mapper'

const emptyObjects: R2Object[] = []
const objectsQueryKey = (connectionId: string | undefined, prefix: string) => ['storage', 'r2', 'objects', connectionId ?? null, prefix] as const

interface FilesViewProps {
  selectedConnection: Pick<R2ConnectionEntry, 'bucket'> | null
  onAddConnection: () => void
  onUpload: (prefix: string) => void
  isUploading: boolean
  onDownload: (prefix: string, items: StorageItem[]) => void
  isDownloading: boolean
  onNotice: (message: string) => void
}

export function FilesView({ selectedConnection, onAddConnection, onUpload, isUploading, onDownload, isDownloading, onNotice }: FilesViewProps) {
  const { connection, isRestoring } = useR2Connection()
  const [path, setPath] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [focused, setFocused] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [grid, setGrid] = useState(false)
  const [sortAscending, setSortAscending] = useState(true)
  const connectionId = connection?.connectionId
  const queryClient = useQueryClient()
  const objectsQuery = useInfiniteQuery({
    queryKey: objectsQueryKey(connectionId, path),
    queryFn: ({ pageParam }) => listR2Objects(connectionId!, path, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextToken ?? undefined,
    enabled: Boolean(connectionId),
  })
  const deleteMutation = useMutation({
    mutationFn: ({ connectionId, keys }: { connectionId: string, keys: string[] }) => deleteR2Objects(connectionId, keys),
    onSettled: (_result, _error, { connectionId }) => queryClient.invalidateQueries({
      queryKey: ['storage', 'r2', 'objects', connectionId],
    }),
  })
  const createFolderMutation = useMutation({
    mutationFn: ({ connectionId, prefix, name }: { connectionId: string, prefix: string, name: string }) => createR2Folder(connectionId, prefix, name),
    onSuccess: (_result, { connectionId }) => queryClient.invalidateQueries({
      queryKey: ['storage', 'r2', 'objects', connectionId],
    }),
  })
  const moveMutation = useMutation({
    mutationFn: ({ connectionId, keys, destinationPrefix }: { connectionId: string, keys: string[], destinationPrefix: string }) => moveR2Objects(connectionId, keys, destinationPrefix),
    onSettled: (_result, _error, { connectionId }) => queryClient.invalidateQueries({
      queryKey: ['storage', 'r2', 'objects', connectionId],
    }),
  })
  const copyMutation = useMutation({
    mutationFn: ({ connectionId, keys, destinationPrefix }: { connectionId: string, keys: string[], destinationPrefix: string }) => copyR2Objects(connectionId, keys, destinationPrefix),
    onSettled: (_result, _error, { connectionId }) => queryClient.invalidateQueries({
      queryKey: ['storage', 'r2', 'objects', connectionId],
    }),
  })
  const objects = objectsQuery.data?.pages.flatMap(page => page.objects) ?? emptyObjects
  const loadError = objectsQuery.error instanceof Error ? objectsQuery.error.message : ''

  const bucketName = connection?.bucket ?? selectedConnection?.bucket ?? '未选择存储桶'
  const directoryItems = useMemo(() => connection ? toStorageItems(objects) : [], [connection, objects])
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return directoryItems
      .filter(item => item.name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (a.kind === 'folder' && b.kind !== 'folder')
          return -1
        if (a.kind !== 'folder' && b.kind === 'folder')
          return 1
        return sortAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      })
  }, [directoryItems, search, sortAscending])
  const focusedItem = directoryItems.find(item => item.id === focused)
  const selectedItems = directoryItems.filter(item => selected.includes(item.id))

  function navigateTo(nextPath: string) {
    setPath(nextPath)
    setSelected([])
    setFocused(null)
    setSearch('')
  }

  function openFolder(item: StorageItem) {
    if (item.kind === 'folder' && item.path)
      navigateTo(item.path)
  }

  function toggleSelected(id: string) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  function unavailableAction(label: string) {
    onNotice(connection ? `${label}功能尚未接入。` : '请先添加并连接 Cloudflare R2。')
  }

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key)
      onNotice('对象 Key 已复制。')
    }
    catch {
      onNotice('复制失败，请检查剪贴板权限。')
    }
  }

  function refreshDirectory() {
    setSearch('')
    setSelected([])
    if (connection) {
      void queryClient.resetQueries({ queryKey: objectsQueryKey(connection.connectionId, path), exact: true })
      return
    }
    onNotice('请先添加并连接 Cloudflare R2。')
  }

  async function deleteItems(items: StorageItem[]) {
    if (!connectionId || items.length === 0)
      return
    setSelected([])
    setFocused(null)
    try {
      const result = await deleteMutation.mutateAsync({ connectionId, keys: items.map(item => item.id) })
      onNotice(result.failedKeys.length > 0
        ? `已删除 ${result.deletedCount} 个对象，${result.failedKeys.length} 个对象删除失败。`
        : `已删除 ${result.deletedCount} 个对象。`)
    }
    catch (cause) {
      onNotice(`删除失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  async function moveItems(items: StorageItem[], destinationPrefix: string): Promise<boolean> {
    if (!connectionId || items.length === 0)
      return false
    try {
      const result = await moveMutation.mutateAsync({ connectionId, keys: items.map(item => item.id), destinationPrefix })
      if (result.movedCount > 0) {
        setSelected([])
        setFocused(null)
      }
      const failures = result.failed.slice(0, 2).map(failure => `${failure.key}：${failure.reason}`).join('；')
      onNotice(result.failed.length > 0
        ? `已移动 ${result.movedCount} 个对象，${result.failed.length} 个失败。${failures}${result.failed.length > 2 ? '；还有其他失败项' : ''}`
        : `已移动 ${result.movedCount} 个对象。`)
      return true
    }
    catch (cause) {
      onNotice(`移动失败：${cause instanceof Error ? cause.message : String(cause)}`)
      return false
    }
  }

  async function copyItems(items: StorageItem[], destinationPrefix: string): Promise<boolean> {
    if (!connectionId || items.length === 0)
      return false
    try {
      const result = await copyMutation.mutateAsync({ connectionId, keys: items.map(item => item.id), destinationPrefix })
      const failures = result.failed.slice(0, 2).map(failure => `${failure.key}：${failure.reason}`).join('；')
      onNotice(result.failed.length > 0
        ? `已复制 ${result.copiedCount} 个对象，${result.failed.length} 个失败。${failures}${result.failed.length > 2 ? '；还有其他失败项' : ''}`
        : `已复制 ${result.copiedCount} 个对象。`)
      return true
    }
    catch (cause) {
      onNotice(`复制失败：${cause instanceof Error ? cause.message : String(cause)}`)
      return false
    }
  }

  const browserProps = {
    onConnect: onAddConnection,
    onUpload: () => onUpload(path),
    isUploading,
    onDownload: (items: StorageItem[]) => onDownload(path, items),
    isDownloading,
    path,
    items: visibleItems,
    focusedItem,
    selected,
    selectedItems,
    search,
    grid,
    showDetails,
    sortAscending,
    onSearchChange: setSearch,
    onNavigate: navigateTo,
    onFocus: setFocused,
    onOpenFolder: openFolder,
    onToggleSelected: toggleSelected,
    onSelectAll: () => setSelected(visibleItems.every(item => selected.includes(item.id)) ? [] : visibleItems.map(item => item.id)),
    onClearSelection: () => setSelected([]),
    onGridChange: setGrid,
    onDetailsChange: setShowDetails,
    onSortChange: () => setSortAscending(value => !value),
    onRefresh: refreshDirectory,
    onCopyKey: copyKey,
    onCreateFolder: async (name: string) => {
      if (!connectionId)
        throw new Error('请先连接 Cloudflare R2。')
      await createFolderMutation.mutateAsync({ connectionId, prefix: path, name })
      onNotice(`文件夹“${name.trim()}”已创建。`)
    },
    isCreatingFolder: createFolderMutation.isPending,
    onUnavailableAction: unavailableAction,
    onDelete: deleteItems,
    isDeleting: deleteMutation.isPending,
    connectionId,
    onMove: moveItems,
    isMoving: moveMutation.isPending,
    onCopyObjects: copyItems,
    isCopying: copyMutation.isPending,
    isLoading: objectsQuery.isFetching || isRestoring,
    isLoadingMore: objectsQuery.isFetchingNextPage,
    loadError,
    hasRemoteConnection: Boolean(connection),
    hasNextPage: Boolean(objectsQuery.hasNextPage),
    onLoadMore: () => {
      if (objectsQuery.hasNextPage && !objectsQuery.isFetchingNextPage)
        void objectsQuery.fetchNextPage()
    },
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {/* <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><DatabaseIcon className="size-4" /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">当前存储桶</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{bucketName}</span>
            {selectedConnection && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">Cloudflare R2</span>}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden="true" className={`size-2 rounded-full ${connection ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
          {connection ? '已连接' : '未连接'}
        </span>
      </div> */}
      <FileBrowser key={connectionId ?? 'disconnected'} bucketName={bucketName} {...browserProps} />
    </div>
  )
}
