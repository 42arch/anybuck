import type { StorageItem } from '@/types/storage'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '@/api/invoke'
import { deleteObjects } from '@/api/objects'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import i18n from '@/i18n'
import { showNotice } from '@/lib/notice'

interface DeleteConfirmDialogProps {
  open: boolean
  items: StorageItem[]
  connectionId?: string
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function DeleteConfirmDialog({
  open,
  items,
  connectionId,
  onOpenChange,
  onSuccess,
}: DeleteConfirmDialogProps) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: ({ connectionId, keys }: { connectionId: string, keys: string[] }) =>
      deleteObjects(connectionId, keys),
    onSettled: (_result, _error, { connectionId }) =>
      queryClient.invalidateQueries({
        queryKey: ['storage', 'objects', connectionId],
      }),
  })

  const isDeleting = deleteMutation.isPending
  const names = items.map(item => item.name)
  const folderCount = items.filter(item => item.kind === 'folder').length

  async function handleConfirm() {
    if (!connectionId || items.length === 0)
      return
    try {
      const result = await deleteMutation.mutateAsync({
        connectionId,
        keys: items.map(item => item.id),
      })
      showNotice(
        result.failedKeys.length > 0
          ? i18n.t('dynamic.itemsDeletedPartial', { deleted: result.deletedCount, failed: result.failedKeys.length })
          : i18n.t('dynamic.itemsDeleted', { deleted: result.deletedCount, count: result.deletedCount }),
      )
      onSuccess?.()
      onOpenChange(false)
    }
    catch (cause) {
      showNotice(i18n.t('dynamic.deleteFailed', { message: errorMessage(cause) }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={nextOpen => !isDeleting && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{i18n.t('deleteDialog.confirmTitle')}</DialogTitle>
          <DialogDescription>
            {i18n.t('dynamic.confirmDeleteCount', { count: names.length })}
            {folderCount > 0 && (
              <>
                {' '}
                {i18n.t('dynamic.foldersDeleted', { count: folderCount })}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {names.length > 0 && (
          <ul className="max-h-32 overflow-y-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
            {names.slice(0, 5).map(name => <li key={name} className="truncate">{name}</li>)}
            {names.length > 5 && (
              <li>
                {i18n.t('deleteDialog.additionalItemsPrefix')}
                {' '}
                {names.length - 5}
                {' '}
                {i18n.t('filesToolbar.selectedItemUnit')}
              </li>
            )}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={isDeleting} onClick={() => onOpenChange(false)}>
            {i18n.t('common.cancel')}
          </Button>
          <Button variant="destructive" disabled={isDeleting} onClick={handleConfirm}>
            {isDeleting && <Spinner data-icon="inline-start" />}
            {isDeleting ? i18n.t('deleteDialog.deleting') : i18n.t('deleteDialog.deleteButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
