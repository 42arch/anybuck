import type { StorageItem } from '@/types/storage'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
          ? `已删除 ${result.deletedCount} 个对象，${result.failedKeys.length} 个对象删除失败。`
          : `已删除 ${result.deletedCount} 个对象。`,
      )
      onSuccess?.()
      onOpenChange(false)
    }
    catch (cause) {
      showNotice(`删除失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={nextOpen => !isDeleting && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除所选项目？</DialogTitle>
          <DialogDescription>
            将从当前 Bucket 永久删除
            {' '}
            {names.length}
            {' '}
            个项目。提交后无法在应用中撤回。
            {folderCount > 0 && `其中 ${folderCount} 个文件夹会连同其全部内容一起删除。`}
          </DialogDescription>
        </DialogHeader>
        {names.length > 0 && (
          <ul className="max-h-32 overflow-y-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
            {names.slice(0, 5).map(name => <li key={name} className="truncate">{name}</li>)}
            {names.length > 5 && (
              <li>
                以及另外
                {' '}
                {names.length - 5}
                {' '}
                个项目
              </li>
            )}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={isDeleting} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="destructive" disabled={isDeleting} onClick={handleConfirm}>
            {isDeleting && <Spinner data-icon="inline-start" />}
            {isDeleting ? '正在删除…' : '删除所选项目'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
