import type { StorageItem } from '@/types/storage'
import { ArrowLeftIcon, FolderIcon, HouseIcon, SpinnerGapIcon } from '@phosphor-icons/react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { listObjects } from '@/api/objects'
import { enqueueObjectOperation } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { formatBytes } from '@/lib/format-bytes'
import { showNotice } from '@/lib/notice'
import { useConnectionStore } from '@/store/connection-store'

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
  const [destinationConnectionId, setDestinationConnectionId] = useState(connectionId)
  const [confirmCrossConnection, setConfirmCrossConnection] = useState(false)
  const connections = useConnectionStore(state => state.sessionConnections)
  const targetConnection = connections.find(item => item.connectionId === destinationConnectionId)
  const sourceConnection = connections.find(item => item.connectionId === connectionId)
  const isCrossConnection = destinationConnectionId !== connectionId
  const sameBucket = Boolean(sourceConnection && targetConnection
    && sourceConnection.provider === targetConnection.provider
    && sourceConnection.bucket === targetConnection.bucket
    && sourceConnection.endpoint.replace(/\/+$/, '').toLowerCase() === targetConnection.endpoint.replace(/\/+$/, '').toLowerCase())
  const hasFolder = items.some(item => item.kind === 'folder')
  const knownBytes = items.reduce((total, item) => total + (item.sizeBytes ?? 0), 0)
  const action = operation === 'move' ? '移动' : '复制'

  const operationMutation = useMutation({
    mutationFn: ({ connectionId, destinationConnectionId, keys, destinationPrefix, operation }: {
      connectionId: string
      destinationConnectionId: string
      keys: string[]
      destinationPrefix: string
      operation: 'move' | 'copy'
    }) => enqueueObjectOperation(connectionId, destinationConnectionId, keys, destinationPrefix, operation),
  })

  const isPending = operationMutation.isPending

  const directoriesQuery = useInfiniteQuery({
    queryKey: ['storage', 'objects', destinationConnectionId, destination],
    queryFn: ({ pageParam }) => listObjects(destinationConnectionId, destination, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextToken ?? undefined,
    enabled: Boolean(targetConnection),
  })
  const canBrowse = Boolean(targetConnection)
  const directories = directoriesQuery.data?.pages.flatMap(page => page.objects.filter(object => object.kind === 'directory')) ?? []
  const destinationLabel = destination || '存储桶根目录'
  const invalidDestination = sameBucket && items.some((item) => {
    const target = `${destination ? `${destination}/` : ''}${item.name}${item.kind === 'folder' ? '/' : ''}`
    return target === item.id || (item.kind === 'folder' && target.startsWith(item.id))
  })

  async function handleSubmit() {
    if (!connectionId || !targetConnection || items.length === 0)
      return
    try {
      const tasks = await operationMutation.mutateAsync({
        connectionId,
        destinationConnectionId,
        keys: items.map(item => item.id),
        destinationPrefix: destination,
        operation,
      })
      const failed = tasks.filter(task => task.parentId === null && task.status === 'failed').length
      if (failed > 0)
        showNotice(`${failed} 个项目无法${action}，请在任务中心查看原因。`)
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
            {confirmCrossConnection ? '确认跨连接操作。' : '选择目标连接和文件夹。将'}
            {action}
            {' '}
            {items.length}
            {' '}
            个项目；已存在的同名项目不会被覆盖。
          </DialogDescription>
        </DialogHeader>
        {confirmCrossConnection
          ? (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <p>
                  {sourceConnection?.name ?? '源连接'}
                  {' '}
                  →
                  {' '}
                  {targetConnection?.name ?? '目标连接'}
                </p>
                <p>
                  目标位置：
                  {targetConnection?.bucket}
                  /
                  {destination || '根目录'}
                </p>
                <p>
                  所选项目：
                  {items.length}
                  {' '}
                  个；已知大小
                  {' '}
                  {formatBytes(knownBytes, 1)}
                  {hasFolder ? '（文件夹内容将在入队时枚举）' : ''}
                </p>
                <p className="text-muted-foreground">
                  文件会经本机下载并上传，最多可能占用两个并行对象的总大小作为临时磁盘空间。
                  {operation === 'move' ? '移动验证会再次读取目标对象。' : ''}
                  对象版本、标签和访问控制设置不会迁移。
                  {operation === 'move' ? '目标内容验证成功后才会删除源文件。' : '源文件会保留。'}
                </p>
              </div>
            )
          : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" htmlFor="destination-connection">目标连接</label>
                <Select
                  value={destinationConnectionId}
                  onValueChange={(value) => {
                    if (value) {
                      setDestinationConnectionId(value)
                      setDestination('')
                    }
                  }}
                >
                  <SelectTrigger id="destination-connection" className="w-full" disabled={isPending}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {connections.map(item => (
                        <SelectItem key={item.connectionId} value={item.connectionId}>
                          {item.name}
                          {' '}
                          ·
                          {item.bucket}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
        {!confirmCrossConnection && (
          <>
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
              {canBrowse && directoriesQuery.isPending && <div className="flex justify-center p-8"><Spinner /></div>}
              {directoriesQuery.isError && (
                <p className="p-3 text-destructive">
                  读取目标文件夹失败：
                  {directoriesQuery.error.message}
                </p>
              )}
              {!canBrowse && <p className="p-3 text-muted-foreground">请先连接目标存储桶。</p>}
              {canBrowse && !directoriesQuery.isPending && !directoriesQuery.isError && directories.length === 0 && <p className="p-3 text-muted-foreground">当前目录下没有子文件夹</p>}
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
          </>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => confirmCrossConnection ? setConfirmCrossConnection(false) : onOpenChange(false)}>{confirmCrossConnection ? '返回' : '取消'}</Button>
          <Button
            disabled={isPending || invalidDestination || !canBrowse || (!confirmCrossConnection && (directoriesQuery.isPending || directoriesQuery.isError))}
            onClick={() => isCrossConnection && !confirmCrossConnection ? setConfirmCrossConnection(true) : void handleSubmit()}
          >
            {isPending && <Spinner data-icon="inline-start" />}
            {isPending ? `正在${action}…` : confirmCrossConnection ? `确认${action}` : `${action}到此处`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
