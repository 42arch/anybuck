import type { FormEvent } from 'react'
import type { StorageConnectionEntry } from '@/types/connection'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useStorageConnection } from '@/hooks/use-storage-connection'
import { showNotice } from '@/lib/notice'

interface RenameConnectionDialogProps {
  connection: StorageConnectionEntry
  onClose: () => void
}

export function RenameConnectionDialog({ connection, onClose }: RenameConnectionDialogProps) {
  const { renameConnection } = useStorageConnection()
  const [name, setName] = useState(connection.name)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('请输入连接名称。')
      return
    }
    if (trimmedName === connection.name) {
      onClose()
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await renameConnection(connection.connectionId, trimmedName)
      showNotice(`连接已重命名为“${trimmedName}”。`)
      onClose()
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving)
          onClose()
      }}
    >
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>重命名连接</DialogTitle>
            <DialogDescription>更改侧边栏中的连接名称，不会修改 Bucket 或访问凭证。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename-connection-name">连接名称</Label>
            <Input
              id="rename-connection-name"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={event => setName(event.target.value)}
              disabled={isSaving}
              aria-invalid={Boolean(error)}
            />
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>取消</Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving && <Spinner data-icon="inline-start" />}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
