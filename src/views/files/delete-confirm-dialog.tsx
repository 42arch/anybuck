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

interface DeleteConfirmDialogProps {
  open: boolean
  names: string[]
  folderCount: number
  isDeleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function DeleteConfirmDialog({ open, names, folderCount, isDeleting, onOpenChange, onConfirm }: DeleteConfirmDialogProps) {
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
          <Button variant="outline" disabled={isDeleting} onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="destructive" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting && <Spinner data-icon="inline-start" />}
            {isDeleting ? '正在删除…' : '删除所选项目'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
