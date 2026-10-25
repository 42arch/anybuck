import type { StorageItem, StorageObject } from '@/types/storage'
import { CloudArrowUpIcon } from '@phosphor-icons/react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { countObjects, listObjects } from '@/api/objects'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { useFilesDragDrop } from '@/hooks/use-files-drag-drop'
import { useStorageConnection } from '@/hooks/use-storage-connection'
import { showNotice } from '@/lib/notice'
import { toStorageItems } from '@/lib/storage-items'
import { useConnectionDialogStore } from '@/store/connection-dialog-store'
import { useFileTransferStore } from '@/store/file-transfer-store'
import { CreateFolderDialog } from './create-folder-dialog'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { FileDetails } from './file-details'
import { FilePreviewDialog } from './file-preview-dialog'
import { FilesEmpty } from './files-empty'
import { FilesGrid } from './files-grid'
import { FilesPagination } from './files-pagination'
import { FilesTable } from './files-table'
import { FilesToolbar } from './files-toolbar'
import { ObjectDestinationDialog } from './object-destination-dialog'

const emptyObjects: StorageObject[] = []
const objectsPageSize = 100
const objectsQueryKey = (connectionId: string | undefined, prefix: string, search = '') => ['storage', 'objects', connectionId ?? null, prefix, search] as const

export function FilesView() {
  const { connection, selectedConnection, selectionVersion, isRestoring } = useStorageConnection()
  const openConnectionDialog = useConnectionDialogStore(state => state.openDialog)
  const downloadItems = useFileTransferStore(state => state.downloadItems)
  const onNotice = showNotice

  const [path, setPath] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedItemsById, setSelectedItemsById] = useState<Record<string, StorageItem>>({})
  const [focused, setFocused] = useState<string | null>(null)
  const [grid, setGrid] = useState(false)
  const [displayMode, setDisplayMode] = useState<'pagination' | 'infinite'>('pagination')
  const pageScope = JSON.stringify([connection?.connectionId ?? '', path, debouncedSearch])
  const [pageState, setPageState] = useState({ scope: pageScope, index: 0 })
  const pageIndex = pageState.scope === pageScope ? pageState.index : 0
  const setPageIndex = (next: number | ((current: number) => number)) => {
    setPageState((current) => {
      const currentIndex = current.scope === pageScope ? current.index : 0
      return { scope: pageScope, index: typeof next === 'function' ? next(currentIndex) : next }
    })
  }
  const [sortAscending, setSortAscending] = useState(true)

  const [deleteTargets, setDeleteTargets] = useState<StorageItem[]>([])
  const [destinationAction, setDestinationAction] = useState<{ operation: 'move' | 'copy', items: StorageItem[] } | null>(null)
  const [previewItem, setPreviewItem] = useState<StorageItem | null>(null)
  const [detailsItem, setDetailsItem] = useState<StorageItem | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)

  const listViewportRef = useRef<HTMLDivElement>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreInFlightRef = useRef(false)

  const { dragOver, dropZoneRef } = useFilesDragDrop({
    enabled: Boolean(connection),
    path,
  })

  useEffect(() => {
    const nextSearch = search.trim()
    if (nextSearch === debouncedSearch)
      return
    const timer = window.setTimeout(setDebouncedSearch, 300, nextSearch)
    return () => window.clearTimeout(timer)
  }, [search, debouncedSearch])

  useEffect(() => {
    setPath('')
    setSearch('')
    setDebouncedSearch('')
    setSelectedItemsById({})
    setFocused(null)
    setDeleteTargets([])
    setDestinationAction(null)
    setPreviewItem(null)
    setDetailsItem(null)
    setCreateFolderOpen(false)
    setPageState({ scope: JSON.stringify([connection?.connectionId ?? '', '', '']), index: 0 })
  }, [connection?.connectionId, selectionVersion])

  const connectionId = connection?.connectionId
  const hasRemoteConnection = Boolean(connection)
  const bucketName = connection?.bucket ?? selectedConnection?.bucket ?? '未选择存储桶'

  const queryClient = useQueryClient()
  const objectsQuery = useInfiniteQuery({
    queryKey: objectsQueryKey(connectionId, path, debouncedSearch),
    queryFn: ({ pageParam }) => listObjects(connectionId!, path, pageParam, debouncedSearch),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextToken ?? undefined,
    enabled: Boolean(connectionId),
  })
  const countQuery = useQuery({
    queryKey: [...objectsQueryKey(connectionId, path, debouncedSearch), 'count'],
    queryFn: () => countObjects(connectionId!, path, debouncedSearch),
    enabled: Boolean(connectionId),
  })

  const objects = objectsQuery.data?.pages.flatMap(page => page.objects) ?? emptyObjects
  const pageObjects = displayMode === 'infinite'
    ? objects
    : objectsQuery.data?.pages[pageIndex]?.objects ?? emptyObjects
  const loadError = objectsQuery.error instanceof Error ? objectsQuery.error.message : ''
  const isSearchPending = search.trim() !== debouncedSearch

  const directoryItems = useMemo(() => connection ? toStorageItems(objects) : [], [connection, objects])
  const pageDirectoryItems = useMemo(() => connection ? toStorageItems(pageObjects) : [], [connection, pageObjects])
  const visibleItems = useMemo(() => {
    if (isSearchPending)
      return []
    return pageDirectoryItems
      .sort((a, b) => {
        if (a.kind === 'folder' && b.kind !== 'folder')
          return -1
        if (a.kind !== 'folder' && b.kind === 'folder')
          return 1
        return sortAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      })
  }, [pageDirectoryItems, isSearchPending, sortAscending])

  const focusedItem = directoryItems.find(item => item.id === focused)
  const selectedItems = Object.values(selectedItemsById)
  const selected = Object.keys(selectedItemsById)

  const pageCount = countQuery.data === undefined ? undefined : Math.max(1, Math.ceil(countQuery.data / objectsPageSize))
  const canGoToNextPage = Boolean(objectsQuery.hasNextPage) || pageIndex + 1 < (objectsQuery.data?.pages.length ?? 0)
  const currentPage = pageIndex + 1
  const isLoading = objectsQuery.isFetching || isRestoring || isSearchPending
  const isLoadingPage = objectsQuery.isFetchingNextPage || isSearchPending
  const hasNextPage = Boolean(objectsQuery.hasNextPage)
  const loadedCount = objects.length
  const totalCount = countQuery.data
  const isCounting = countQuery.isFetching || isSearchPending
  const countError = countQuery.error instanceof Error ? countQuery.error.message : ''

  function navigateTo(nextPath: string) {
    setPath(nextPath)
    setPageIndex(0)
    setSelectedItemsById({})
    setFocused(null)
    setSearch('')
    setDebouncedSearch('')
  }

  function openFolder(item: StorageItem) {
    if (item.kind === 'folder' && item.path)
      navigateTo(item.path)
  }

  function toggleSelected(item: StorageItem) {
    setSelectedItemsById((current) => {
      const next = { ...current }
      if (next[item.id])
        delete next[item.id]
      else
        next[item.id] = item
      return next
    })
  }

  function toggleSelectVisible() {
    setSelectedItemsById((current) => {
      const next = { ...current }
      if (visibleItems.every(item => current[item.id])) {
        visibleItems.forEach(item => delete next[item.id])
      }
      else {
        visibleItems.forEach(item => next[item.id] = item)
      }
      return next
    })
  }

  function unavailableAction(label: string) {
    onNotice(connection ? `${label}功能尚未接入。` : '请先添加并连接存储桶。')
  }

  function refreshDirectory() {
    setSearch('')
    setDebouncedSearch('')
    setSelectedItemsById({})
    setPageIndex(0)
    if (connection) {
      void queryClient.resetQueries({ queryKey: objectsQueryKey(connection.connectionId, path) })
      return
    }
    onNotice('请先添加并连接存储桶。')
  }

  function changeSearch(value: string) {
    setSearch(value)
    setPageIndex(0)
    setSelectedItemsById({})
    setFocused(null)
  }

  async function goToPage(page: number) {
    if (isSearchPending)
      return
    const targetIndex = page - 1
    if (targetIndex < 0 || (countQuery.data !== undefined && page > Math.max(1, Math.ceil(countQuery.data / objectsPageSize))))
      return

    let loadedPageCount = objectsQuery.data?.pages.length ?? 0
    if (targetIndex < loadedPageCount) {
      setPageIndex(targetIndex)
      return
    }
    if (objectsQuery.isFetchingNextPage)
      return

    while (loadedPageCount <= targetIndex) {
      if (!objectsQuery.hasNextPage)
        return
      const result = await objectsQuery.fetchNextPage()
      const nextPageCount = result.data?.pages.length ?? 0
      if (nextPageCount <= loadedPageCount)
        return
      loadedPageCount = nextPageCount
    }
    setPageIndex(targetIndex)
  }

  const loadNextPage = useCallback(async () => {
    if (isSearchPending || !objectsQuery.hasNextPage || objectsQuery.isFetchingNextPage || loadMoreInFlightRef.current)
      return
    loadMoreInFlightRef.current = true
    try {
      await objectsQuery.fetchNextPage()
    }
    finally {
      loadMoreInFlightRef.current = false
    }
  }, [objectsQuery, isSearchPending])

  useEffect(() => {
    const root = listViewportRef.current
    const sentinel = loadMoreSentinelRef.current
    if (displayMode !== 'infinite' || !hasRemoteConnection || !hasNextPage || isLoadingPage || !root || !sentinel)
      return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting)
        void loadNextPage()
    }, { root, rootMargin: '160px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [displayMode, hasRemoteConnection, hasNextPage, isLoadingPage, loadNextPage])

  function openDestination(operation: 'move' | 'copy', items: StorageItem[]) {
    if (!connectionId) {
      unavailableAction(operation === 'move' ? '移动' : '复制')
      return
    }
    setDestinationAction({ operation, items })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div ref={dropZoneRef} className="relative grid min-h-0 min-w-0 flex-1">
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10" role="status">
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-card px-6 py-5 text-center shadow-sm">
              <CloudArrowUpIcon className="size-8 text-primary" />
              <span className="font-medium">松开以上传到当前目录</span>
              <span className="text-xs text-muted-foreground">{`${bucketName}/${path ? `${path}/` : ''}`}</span>
            </div>
          </div>
        )}
        <Card size="sm" className="h-full min-h-0 min-w-0 gap-0 pt-0">
          <CardContent className="flex min-h-0 flex-1 min-w-0 flex-col gap-0 overflow-visible px-0">
            {loadError && (
              <Alert variant="destructive" className="m-4 mb-0">
                <AlertTitle>无法读取存储对象</AlertTitle>
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            )}
            <FilesToolbar
              bucketName={bucketName}
              path={path}
              search={search}
              grid={grid}
              selectedCount={selected.length}
              onNavigate={navigateTo}
              onSearchChange={changeSearch}
              onCreateFolderClick={() => {
                if (!hasRemoteConnection) {
                  unavailableAction('新建文件夹')
                  return
                }
                setCreateFolderOpen(true)
              }}
              onRefresh={refreshDirectory}
              onGridChange={setGrid}
              onDownloadSelected={() => void downloadItems(path, selectedItems)}
              onCopySelected={() => openDestination('copy', selectedItems)}
              onMoveSelected={() => openDestination('move', selectedItems)}
              onDeleteSelected={() => setDeleteTargets(selectedItems)}
              onClearSelection={() => setSelectedItemsById({})}
            />

            <div ref={listViewportRef} className="min-h-0 flex-1 overflow-y-auto">
              {visibleItems.length === 0
                ? (
                    <FilesEmpty
                      isLoading={isLoading}
                      hasRemoteConnection={hasRemoteConnection}
                      loadError={loadError}
                      search={search}
                      onConnect={() => openConnectionDialog()}
                    />
                  )
                : grid
                  ? (
                      <FilesGrid
                        items={visibleItems}
                        focusedId={focusedItem?.id}
                        onFocus={setFocused}
                        onOpenFolder={openFolder}
                        onDetails={(item) => {
                          setFocused(item.id)
                          setDetailsItem(item)
                        }}
                        onPreview={setPreviewItem}
                        onDownload={item => void downloadItems(path, [item])}
                        onCopy={item => openDestination('copy', [item])}
                        onMove={item => openDestination('move', [item])}
                        onDelete={(item) => {
                          setFocused(item.id)
                          setDeleteTargets([item])
                        }}
                      />
                    )
                  : (
                      <FilesTable
                        items={visibleItems}
                        selected={selected}
                        focusedId={focusedItem?.id}
                        sortAscending={sortAscending}
                        onSelectAll={toggleSelectVisible}
                        onToggleSelected={toggleSelected}
                        onSortToggle={() => setSortAscending(value => !value)}
                        onFocus={setFocused}
                        onOpenFolder={openFolder}
                        onDetails={(item) => {
                          setFocused(item.id)
                          setDetailsItem(item)
                        }}
                        onPreview={setPreviewItem}
                        onDownload={item => void downloadItems(path, [item])}
                        onCopy={item => openDestination('copy', [item])}
                        onMove={item => openDestination('move', [item])}
                        onDelete={(item) => {
                          setFocused(item.id)
                          setDeleteTargets([item])
                        }}
                      />
                    )}
              {displayMode === 'infinite' && <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />}
            </div>
          </CardContent>

          <FilesPagination
            hasRemoteConnection={hasRemoteConnection}
            isCounting={isCounting}
            countError={countError}
            displayMode={displayMode}
            loadedCount={loadedCount}
            totalCount={totalCount}
            currentPage={currentPage}
            pageCount={pageCount}
            canGoToNextPage={canGoToNextPage}
            hasNextPage={hasNextPage}
            isLoadingPage={isLoadingPage}
            onRetryCount={() => void countQuery.refetch()}
            onPageChange={page => void goToPage(page)}
            onLoadMore={() => void loadNextPage()}
            onDisplayModeChange={setDisplayMode}
          />
        </Card>

        {detailsItem && (
          <FileDetails
            item={detailsItem}
            connection={connection}
            path={path}
            onClose={() => setDetailsItem(null)}
            onOpenFolder={(item) => {
              setDetailsItem(null)
              openFolder(item)
            }}
          />
        )}
        <FilePreviewDialog
          item={previewItem}
          connectionId={connectionId}
          onClose={() => setPreviewItem(null)}
        />
        <DeleteConfirmDialog
          open={deleteTargets.length > 0}
          items={deleteTargets}
          connectionId={connectionId}
          onOpenChange={open => !open && setDeleteTargets([])}
          onSuccess={() => {
            setSelectedItemsById({})
            setFocused(null)
            setPageIndex(0)
            setDeleteTargets([])
          }}
        />
        {destinationAction && connectionId && (
          <ObjectDestinationDialog
            connectionId={connectionId}
            items={destinationAction.items}
            currentPath={path}
            operation={destinationAction.operation}
            onOpenChange={open => !open && setDestinationAction(null)}
            onSuccess={() => {
              if (destinationAction.operation === 'move') {
                setSelectedItemsById({})
                setFocused(null)
              }
            }}
          />
        )}
        <CreateFolderDialog
          open={createFolderOpen}
          path={path}
          connectionId={connectionId}
          bucketName={bucketName}
          onOpenChange={setCreateFolderOpen}
          onSuccess={() => setPageIndex(0)}
        />
      </div>
    </div>
  )
}
