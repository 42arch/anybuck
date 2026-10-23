import type { StorageItem } from '@/types/storage'
import { ArrowLeftIcon, FolderIcon, HouseIcon, SpinnerGapIcon } from '@phosphor-icons/react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { listObjects } from '@/api/objects'
import { enqueueObjectOperation } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { showNotice } from '@/lib/notice'

interface ObjectDestinationDialogProps {
  connectionId: string
  items: StorageItem[]
  currentPath: string
  operation: 'move' | 'copy'
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function ObjectDestinationDialog({
  connectionId,
  items,
  currentPath,
  operation,
  onOpenChange,
  onSuccess,
}: ObjectDestinationDialogProps) {
  const [destination, setDestination] = useState(currentPath)
  const action = operation === 'move' ? '移动' : '复制'

  const operationMutation = useMutation({
    mutationFn: ({ connectionId, keys, destinationPrefix, operation }: {
      connectionId: string
      keys: string[]
      destinationPrefix: string
      operation: 'move' | 'copy'
    }) => enqueueObjectOperation(connectionId, keys, destinationPrefix, operation),
  })

  const isPending = operationMutation.isPending

  const directoriesQuery = useInfiniteQuery({
    queryKey: ['storage', 'objects', connectionId, destination],
    queryFn: ({ pageParam }) => listObjects(connectionId, destination, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextToken ?? undefined,
  })
  const directories = directoriesQuery.data?.pages.flatMap(page => page.objects.filter(object => object.kind === 'directory')) ?? []
  const destinationLabel = destination || '存储桶根目录'
  const invalidDestination = items.some((item) => {
    const target = `${destination ? `${destination}/` : ''}${item.name}${item.kind === 'folder' ? '/' : ''}`
    return target === item.id || (item.kind === 'folder' && target.startsWith(item.id))
  })

  async function handleSubmit() {
    if (!connectionId || items.length === 0)
      return
    try {
      await operationMutation.mutateAsync({
        connectionId,
        keys: items.map(item => item.id),
        destinationPrefix: destination,
        operation,
      })
      onSuccess?.()
      onOpenChange(false)
    }
    catch (cause) {
      showNotice(`${action}失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  return (
    <Dialog open onOpenChange={open => !isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            {action}
            所选项目
          </DialogTitle>
          <DialogDescription>
            选择目标文件夹。将
            {action}
            {' '}
            {items.length}
            {' '}
            个项目；已存在的同名项目不会被覆盖。
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
          <Button variant="ghost" size="icon-sm" aria-label="返回上一级" disabled={!destination || isPending} onClick={() => setDestination(destination.split('/').slice(0, -1).join('/'))}>
            <ArrowLeftIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="存储桶根目录" disabled={!destination || isPending} onClick={() => setDestination('')}>
            <HouseIcon />
          </Button>
          <span className="min-w-0 truncate font-medium" title={destinationLabel}>{destinationLabel}</span>
        </div>
        <div className="min-h-36 max-h-64 overflow-y-auto rounded-md border p-1">
          {directoriesQuery.isPending && <div className="flex justify-center p-8"><Spinner /></div>}
          {directoriesQuery.isError && (
            <p className="p-3 text-destructive">
              读取目标文件夹失败：
              {directoriesQuery.error.message}
            </p>
          )}
          {!directoriesQuery.isPending && !directoriesQuery.isError && directories.length === 0 && <p className="p-3 text-muted-foreground">当前目录下没有子文件夹</p>}
          {directories.map(directory => (
            <Button
              key={directory.key}
              variant="ghost"
              className="w-full justify-start"
              disabled={isPending}
              onClick={() => setDestination(directory.key.replace(/\/$/, ''))}
            >
              <FolderIcon data-icon="inline-start" />
              <span className="truncate">{directory.name}</span>
            </Button>
          ))}
          {directoriesQuery.hasNextPage && (
            <Button variant="ghost" className="w-full" disabled={directoriesQuery.isFetchingNextPage || isPending} onClick={() => directoriesQuery.fetchNextPage()}>
              {directoriesQuery.isFetchingNextPage ? <SpinnerGapIcon className="animate-spin" data-icon="inline-start" /> : null}
              {directoriesQuery.isFetchingNextPage ? '正在加载…' : '加载更多文件夹'}
            </Button>
          )}
        </div>
        {invalidDestination && (
          <p className="text-xs text-destructive">
            不能
            {action}
            到原位置或所选文件夹内部。
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            disabled={isPending || invalidDestination || directoriesQuery.isPending || directoriesQuery.isError}
            onClick={() => void handleSubmit()}
          >
            {isPending && <Spinner data-icon="inline-start" />}
            {isPending ? `正在${action}…` : `${action}到此处`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
