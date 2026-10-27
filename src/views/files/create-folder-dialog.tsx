import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage } from '@/api/invoke'
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
import i18n from '@/i18n'
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
      setError(i18n.t('createFolder.enterFolderName'))
      return
    }
    if (!connectionId) {
      setError(i18n.t('createFolder.connectBucketFirst'))
      return
    }
    setError('')
    try {
      await createFolderMutation.mutateAsync({ connectionId, prefix: path, name })
      showNotice(i18n.t('dynamic.folderCreated', { name }))
      setFolderName('')
      onSuccess?.()
      onOpenChange(false)
    }
    catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{i18n.t('createFolder.createFolderCurrentFolder')}</DialogTitle>
            <DialogDescription>
              {i18n.t('dynamic.createFolderUnder', { path: path ? `${path}/` : `${bucketName}/` })}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label={i18n.t('createFolder.folderName')}
            placeholder={i18n.t('createFolder.folderName')}
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
              {i18n.t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isPending || !folderName.trim()}>
              {isPending && <Spinner data-icon="inline-start" />}
              {isPending ? i18n.t('createFolder.creating') : i18n.t('createFolder.createFolder')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
