import type { StorageItem } from '@/types/storage'
import { ArrowLeftIcon, CaretDownIcon, FolderIcon, HouseIcon, SpinnerGapIcon } from '@phosphor-icons/react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage } from '@/api/invoke'
import { listObjects } from '@/api/objects'
import { enqueueObjectOperation } from '@/api/transfers'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import i18n from '@/i18n'
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
  const action = operation === 'move' ? i18n.t('common.move') : i18n.t('common.copy')

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
  const destinationLabel = destination || i18n.t('filesToolbar.bucketRoot')
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
        showNotice(i18n.t('dynamic.operationPartialFailure', { count: failed, action: action.toLowerCase() }))
      onSuccess?.()
      onOpenChange(false)
    }
    catch (cause) {
      showNotice(i18n.t('dynamic.operationFailed', { action, message: errorMessage(cause) }))
    }
  }

  return (
    <Dialog open onOpenChange={open => !isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            {i18n.t('dynamic.destinationTitle', { action })}
          </DialogTitle>
          <DialogDescription>
            {i18n.t(confirmCrossConnection ? 'dynamic.crossDestinationDescription' : 'dynamic.destinationDescription', { action, count: items.length })}
          </DialogDescription>
        </DialogHeader>
        {confirmCrossConnection
          ? (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <p>
                  {sourceConnection?.name ?? i18n.t('destinationDialog.sourceConnection')}
                  {' '}
                  →
                  {' '}
                  {targetConnection?.name ?? i18n.t('destinationDialog.destinationConnection')}
                </p>
                <p>
                  {i18n.t('destinationDialog.destination')}
                  {targetConnection?.bucket}
                  /
                  {destination || i18n.t('destinationDialog.rootFolder')}
                </p>
                <p>
                  {i18n.t('dynamic.destinationSummary', { count: items.length, size: formatBytes(knownBytes, 1) })}
                  {hasFolder ? i18n.t('destinationDialog.folderContentsListedTaskQueued') : ''}
                </p>
                <p className="text-muted-foreground">{i18n.t('destinationDialog.crossConnectionSummary')}</p>
                {operation === 'move' && <p className="text-muted-foreground">{i18n.t('destinationDialog.deleteSourceAfterVerificationHint')}</p>}
                <Collapsible>
                  <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                    {i18n.t('destinationDialog.transferDetails')}
                    <CaretDownIcon data-icon="inline-end" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="flex flex-col gap-1 pt-2 text-xs text-muted-foreground">
                    <p>{i18n.t('destinationDialog.crossConnectionTransferHint')}</p>
                    {operation === 'move' && <p>{i18n.t('destinationDialog.moveVerificationReadsDestinationObject')}</p>}
                    <p>{i18n.t('destinationDialog.metadataNotTransferredHint')}</p>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )
          : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" htmlFor="destination-connection">{i18n.t('destinationDialog.destinationConnection')}</label>
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
              <Button variant="ghost" size="icon-sm" aria-label={i18n.t('destinationDialog.goOneLevel')} disabled={!destination || isPending} onClick={() => setDestination(destination.split('/').slice(0, -1).join('/'))}>
                <ArrowLeftIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={i18n.t('filesToolbar.bucketRoot')} disabled={!destination || isPending} onClick={() => setDestination('')}>
                <HouseIcon />
              </Button>
              <span className="min-w-0 truncate font-medium" title={destinationLabel}>{destinationLabel}</span>
            </div>
            <div className="min-h-36 max-h-64 overflow-y-auto rounded-md border p-1">
              {canBrowse && directoriesQuery.isPending && <div className="flex justify-center p-8"><Spinner /></div>}
              {directoriesQuery.isError && (
                <p className="p-3 text-destructive">
                  {i18n.t('destinationDialog.loadFoldersFailed')}
                  {errorMessage(directoriesQuery.error)}
                </p>
              )}
              {!canBrowse && <p className="p-3 text-muted-foreground">{i18n.t('destinationDialog.connectDestinationBucketFirst')}</p>}
              {canBrowse && !directoriesQuery.isPending && !directoriesQuery.isError && directories.length === 0 && <p className="p-3 text-muted-foreground">{i18n.t('destinationDialog.noSubfoldersFolder')}</p>}
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
                  {directoriesQuery.isFetchingNextPage ? i18n.t('shared.loading') : i18n.t('destinationDialog.loadMoreFolders')}
                </Button>
              )}
            </div>
            {invalidDestination && (
              <p className="text-xs text-destructive">
                {i18n.t('dynamic.invalidDestination', { action: action.toLowerCase() })}
              </p>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => confirmCrossConnection ? setConfirmCrossConnection(false) : onOpenChange(false)}>{confirmCrossConnection ? i18n.t('common.back') : i18n.t('common.cancel')}</Button>
          <Button
            disabled={isPending || invalidDestination || !canBrowse || (!confirmCrossConnection && (directoriesQuery.isPending || directoriesQuery.isError))}
            onClick={() => isCrossConnection && !confirmCrossConnection ? setConfirmCrossConnection(true) : void handleSubmit()}
          >
            {isPending && <Spinner data-icon="inline-start" />}
            {isPending ? i18n.t('dynamic.operationPending', { action }) : confirmCrossConnection ? i18n.t('dynamic.operationConfirm', { action }) : i18n.t('dynamic.operationHere', { action })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
