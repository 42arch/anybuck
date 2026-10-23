import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createFolder } from '@/api/objects'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { showNotice } from '@/lib/notice'

interface CreateFolderDialogProps {
  open: boolean
  path: string
  connectionId?: string
  bucketName: string
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function CreateFolderDialog({
  open,
  path,
  connectionId,
  bucketName,
  onOpenChange,
  onSuccess,
}: CreateFolderDialogProps) {
  const [folderName, setFolderName] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const createFolderMutation = useMutation({
    mutationFn: ({ connectionId, prefix, name }: { connectionId: string, prefix: string, name: string }) =>
      createFolder(connectionId, prefix, name),
    onSuccess: (_result, { connectionId }) =>
      queryClient.invalidateQueries({
        queryKey: ['storage', 'objects', connectionId],
      }),
  })

  const isPending = createFolderMutation.isPending

  function handleOpenChange(nextOpen: boolean) {
    if (isPending)
      return
    if (!nextOpen) {
      setFolderName('')
      setError('')
    }
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = folderName.trim()
    if (!name) {
      setError('请输入文件夹名称。')
      return
    }
    if (!connectionId) {
      setError('请先连接存储桶。')
      return
    }
    setError('')
    try {
      await createFolderMutation.mutateAsync({ connectionId, prefix: path, name })
      showNotice(`文件夹“${name}”已创建。`)
      setFolderName('')
      onSuccess?.()
      onOpenChange(false)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>在当前目录新建文件夹</DialogTitle>
            <DialogDescription>
              将在
              {' '}
              {path ? `${path}/` : `${bucketName}/`}
              {' '}
              下创建文件夹。
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="文件夹名称"
            placeholder="文件夹名称"
            value={folderName}
            onChange={event => setFolderName(event.target.value)}
            disabled={isPending}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending || !folderName.trim()}>
              {isPending && <Spinner data-icon="inline-start" />}
              {isPending ? '正在创建…' : '创建文件夹'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
